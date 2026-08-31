/**
 * Start lists from vélopressecollection.fr.
 *
 *   npx tsx scripts/scrapers/velopresse-engagements.ts [--pages=8] [--dry-run]
 *
 * The FFC keeps its own start lists behind licensee authentication, but the
 * regional cycling press publishes them openly for Bretagne, Normandie and Pays
 * de la Loire. Each article gives the commune and date in its title, one section
 * per category, and a table of entrants with club — plus bib numbers on the
 * bigger races, which the smaller ones omit.
 *
 * Two matching problems, handled explicitly rather than papered over:
 *
 *   Race — matched on date plus commune. Titles are prose ("Quettetot 15 août
 *   2026 engagés…"), so the commune is taken from the URL slug, which is clean
 *   ASCII, and confirmed against the venue we already geocoded.
 *
 *   Rider — this source has no UCI ID, so the only key is the name. A name that
 *   also matches on club is treated as reliable; a name alone is recorded as
 *   such; an unmatched entry is still stored with the published name, because
 *   "someone called X from club Y is entered" is useful even unlinked.
 */

import * as cheerio from "cheerio";
import { loadEnv, requireEnv } from "../lib/load-env";
import { fetchHtml, politeDelay } from "./utils/http";
import { createSql } from "./utils/db";
import { meetingKey } from "./utils/upsert-races";
import { startRun } from "../lib/track-run";

loadEnv();
const sql = createSql(requireEnv("DATABASE_URL"));

const BASE_URL = "https://www.velopressecollection.fr";
const SECTIONS = ["route", "cyclo-cross", "gravel", "piste"];

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(value: string): string {
  return stripAccents(value.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Pulls the commune and date out of an article slug.
 *
 *   "38058-quettetot-15-aout-2026-engages-de-courses-cyclistes"
 *     → { commune: "quettetot", date: 2026-08-15 }
 *
 * The slug is used rather than the title because it is already accent-free and
 * consistently ordered, where the prose title is neither.
 */
export function parseSlug(
  slug: string
): { commune: string; date: Date } | null {
  const withoutId = slug.replace(/^\d+-/, "").replace(/\.html$/, "");

  // The date is "<day>-<month>-<year>"; a range ("15-16-aout-2026") keeps the
  // first day, which is when the start list applies.
  const m = /(?:^|-)(\d{1,2})(?:-\d{1,2})*-([a-z]+)-(\d{4})(?:-|$)/.exec(
    withoutId
  );
  if (!m) return null;

  const month = MONTHS[m[2]];
  if (!month) return null;

  const date = new Date(Date.UTC(Number(m[3]), month - 1, Number(m[1]), 12));
  if (Number.isNaN(date.getTime())) return null;

  const commune = withoutId.slice(0, m.index).replace(/-/g, " ").trim();
  return commune ? { commune, date } : null;
}

export interface Entrant {
  lastName: string;
  firstName: string | null;
  club: string | null;
  category: string | null;
  bib: string | null;
}

/**
 * "BERTRAND Arnaud" → surname BERTRAND, given name Arnaud.
 * The press writes the surname in capitals, which is what separates the two.
 */
function splitPersonName(raw: string): { last: string; first: string | null } {
  /* Les marques en tête ne font pas partie du nom.
     La source annote certains engagés d'une étoile — « * BRICARD Noa ». Sans
     la retirer, le premier « mot » du nom n'a aucune lettre, la ligne est jugée
     illisible et l'engagé disparaît : douze des vingt-deux d'Alençon. */
  const cleaned = raw
    .replace(/^[\s*•·+\-–—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { last: "", first: null };

  const words = cleaned.split(" ");
  const upper: string[] = [];
  const rest: string[] = [];

  for (const word of words) {
    const letters = stripAccents(word).replace(/[^A-Za-z]/g, "");
    const isUpper = letters.length > 0 && letters === letters.toUpperCase();
    if (isUpper && rest.length === 0) upper.push(word);
    else rest.push(word);
  }

  if (upper.length === 0) {
    // No capitalised block: assume the first word is the surname.
    return { last: words[0], first: words.slice(1).join(" ") || null };
  }

  // "ABRAZARD RAPHAËL" — the whole cell is capitalised, so capitalisation
  // separates nothing and the entrant used to be stored as one long surname
  // with no given name, which no rider could then be matched to.
  //
  // The source writes surname first throughout, so the last word is the given
  // name. Compound surnames survive it ("LE BORGNE NOAH", "JANSE VAN VUUREN
  // DELSIA"); a compound given name does not, and is the price of reading the
  // other several thousand correctly.
  if (rest.length === 0 && upper.length > 1) {
    const country = /^\(?[A-Z]{3}\)?$/;
    const parts = country.test(upper[upper.length - 1])
      ? upper.slice(0, -1)
      : upper;
    if (parts.length > 1) {
      return {
        last: parts.slice(0, -1).join(" "),
        first: parts[parts.length - 1],
      };
    }
  }

  return { last: upper.join(" "), first: rest.join(" ") || null };
}

/**
 * Column roles in a start-list table.
 *
 * The source uses at least three layouts — bib + "NOM Prénom" + club, "NOM
 * Prénom" + club + category, and NOM + Prénom + category + club — so roles are
 * inferred from the data instead of assumed by position. Getting this wrong is
 * silent: the surname column would be read as the club and every entrant would
 * fail to match.
 */
interface ColumnRoles {
  bib?: number;
  fullName?: number;
  lastName?: number;
  firstName?: number;
  club?: number;
  category?: number;
  /** The source sometimes splits "Access 2" into two columns. */
  categoryLevel?: number;
}

const CATEGORY_RE =
  /^(open|access|elite|élite|u\d{2}|a\d|d\d|gs\d|pass|junior|cadet|minime|senior|v[ée]t[ée]ran|f[ée]minine?|espoir)\b/i;

const CLUB_RE =
  /\b(uc|vc|cc|ac|ec|us|as|sc|cs|oc|team|v[ée]lo|cycl|guidon|entente|union|sprinter|amicale|olympique|[ée]toile|p[ée]dale|roue|comit[ée]|sport|club|racing)\b/i;

const ALL_CAPS_RE = /^[^a-z]*$/;

function share(values: string[], predicate: (v: string) => boolean): number {
  const filled = values.filter((v) => v.length > 0);
  if (filled.length === 0) return 0;
  return filled.filter(predicate).length / filled.length;
}

function inferColumns(rows: string[][]): ColumnRoles {
  const width = Math.max(...rows.map((r) => r.length));
  const columns: string[][] = [];
  for (let i = 0; i < width; i++) columns.push(rows.map((r) => r[i] ?? ""));

  const roles: ColumnRoles = {};
  const taken = new Set<number>();

  // A bib column is numeric AND mostly distinct. Without the distinctness test,
  // the digit half of a category split across two columns ("Access" | "2") looks
  // exactly like a bib — and every entrant ends up wearing number 3.
  columns.forEach((col, i) => {
    if (roles.bib !== undefined) return;
    const numeric = share(col, (v) => /^\d{1,3}$/.test(v));
    if (numeric <= 0.8) return;
    const filled = col.filter((v) => v.length > 0);
    const distinct = new Set(filled).size / Math.max(1, filled.length);
    if (distinct > 0.5) {
      roles.bib = i;
      taken.add(i);
    }
  });

  columns.forEach((col, i) => {
    if (taken.has(i) || roles.category !== undefined) return;
    if (share(col, (v) => CATEGORY_RE.test(v)) > 0.6) {
      roles.category = i;
      taken.add(i);
      // The level is often split off into the next column ("Access" | "2");
      // recombining them keeps "Access 2" readable rather than storing "Access".
      const next = i + 1;
      if (
        next < columns.length &&
        !taken.has(next) &&
        share(columns[next], (v) => /^\d{1,2}$/.test(v)) > 0.6
      ) {
        roles.categoryLevel = next;
        taken.add(next);
      }
    }
  });

  columns.forEach((col, i) => {
    if (taken.has(i) || roles.club !== undefined) return;
    const clubish = share(col, (v) => CLUB_RE.test(v));
    const longEnough =
      col.reduce((sum, v) => sum + v.length, 0) / Math.max(1, col.length) > 10;
    if (clubish > 0.5 && longEnough) {
      roles.club = i;
      taken.add(i);
    }
  });

  const remaining = columns
    .map((_, i) => i)
    .filter((i) => !taken.has(i));

  /* D'abord une colonne qui contient un nom entier.
     « BRICARD Noa » a des minuscules, donc la règle des capitales la rejetait ;
     le parseur prenait alors les deux colonnes suivantes — « U23 » et « M » —
     et rangeait la catégorie d'âge en nom et le sexe en prénom. Une colonne de
     noms se reconnaît autrement : plusieurs mots, assez longue, et pas
     uniquement des codes. */
  const looksLikeFullName = (col: string[]) =>
    share(col, (v) => v.split(" ").filter(Boolean).length >= 2) > 0.7 &&
    share(col, (v) => v.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 6) > 0.7;

  for (const i of remaining) {
    if (looksLikeFullName(columns[i])) {
      roles.fullName = i;
      taken.add(i);
      break;
    }
  }

  /* Sinon deux colonnes de texte côte à côte, une fois le dossard, la catégorie
     et le club servis : un nom et un prénom.
     La règle exigeait autrefois que le prénom NE SOIT PAS en capitales, ce qui
     ratait « DAHIREL | CÉLIANE » — une des mises en page ordinaires de la
     source. Ce qui distingue un prénom, c'est d'être un ou deux mots et de ne
     rien dire d'un club ; les capitales ne disent que la façon de saisir.
     Mais il faut aussi que ce soient des mots : « U23 » et « M » passaient tous
     les tests précédents. */
  const isSubstantial = (col: string[]) =>
    share(col, (v) => v.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 4) > 0.7;

  if (roles.fullName === undefined) {
    for (let k = 0; k < remaining.length - 1; k++) {
      const a = columns[remaining[k]];
      const b = columns[remaining[k + 1]];
      if (taken.has(remaining[k]) || taken.has(remaining[k + 1])) continue;
      const aCaps = share(a, (v) => ALL_CAPS_RE.test(v));
      const bSingleWord = share(b, (v) => v.split(" ").length <= 2);
      const bClubbish = share(b, (v) => CLUB_RE.test(v));
      const bCategory = share(b, (v) => CATEGORY_RE.test(v));
      if (
        aCaps > 0.8 &&
        bSingleWord > 0.6 &&
        bClubbish < 0.2 &&
        bCategory < 0.2 &&
        isSubstantial(a) &&
        isSubstantial(b)
      ) {
        roles.lastName = remaining[k];
        roles.firstName = remaining[k + 1];
        taken.add(remaining[k]);
        taken.add(remaining[k + 1]);
        break;
      }
    }
  }

  /* Dernier recours : la première colonne de lettres venue.
     Il faut qu'aucun nom n'ait été trouvé — ni entier, ni en deux morceaux.
     Sans cette seconde condition il écrasait la colonne que la détection venait
     de choisir : « BRICARD Noa » était reconnue, puis remplacée par « U23 ». */
  if (roles.lastName === undefined && roles.fullName === undefined) {
    const nameCol = remaining.find(
      (i) => !taken.has(i) && share(columns[i], (v) => /[A-Za-zÀ-ÿ]/.test(v)) > 0.8
    );
    if (nameCol !== undefined) {
      roles.fullName = nameCol;
      taken.add(nameCol);
    }
  }

  // Last resort for the club, and deliberately narrow: "any leftover column of
  // words longer than three letters" was what turned a column of given names
  // into a column of clubs. A club has to look like one.
  if (roles.club === undefined) {
    const clubCol = columns
      .map((_, i) => i)
      .find(
        (i) =>
          !taken.has(i) &&
          share(columns[i], (v) => v.length > 3) > 0.6 &&
          (share(columns[i], (v) => CLUB_RE.test(v)) > 0.3 ||
            share(columns[i], (v) => v.split(" ").length >= 2) > 0.5)
      );
    if (clubCol !== undefined) roles.club = clubCol;
  }

  return roles;
}

/** Parses one start-list article into its entrants. */
export function parseEntrants(html: string): Entrant[] {
  const $ = cheerio.load(html);
  const entrants: Entrant[] = [];

  // Categories are section headings above their table.
  let currentCategory: string | null = null;

  $("h2, h3, table").each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase();

    if (tag === "h2" || tag === "h3") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      // Headings that introduce other articles are not categories.
      if (/engag|partant/i.test(text)) currentCategory = null;
      else if (text.length > 0 && text.length <= 40) currentCategory = text;
      return;
    }

    const rows: string[][] = [];
    $(el)
      .find("tr")
      .each((__, row) => {
        const cells = $(row)
          .find("td")
          .map((___, td) => $(td).text().replace(/\s+/g, " ").trim())
          .get();
        if (cells.length >= 2) rows.push(cells);
      });

    if (rows.length === 0) return;

    const roles = inferColumns(rows.slice(0, 40));
    if (roles.fullName === undefined && roles.lastName === undefined) return;

    for (const cells of rows) {
      const at = (i?: number) => (i === undefined ? null : cells[i] ?? null);

      let last: string;
      let first: string | null;

      if (roles.lastName !== undefined) {
        last = (at(roles.lastName) ?? "").trim();
        first = (at(roles.firstName) ?? "").trim() || null;
      } else {
        const split = splitPersonName(at(roles.fullName) ?? "");
        last = split.last;
        first = split.first;
      }

      if (!last || !/[A-Za-zÀ-ÿ]/.test(last)) continue;
      if (/^(nom|coureur|dossard)$/i.test(last)) continue;

      const categoryParts = [at(roles.category), at(roles.categoryLevel)]
        .filter((v): v is string => Boolean(v && v.trim()))
        .join(" ")
        .trim();

      entrants.push({
        lastName: last,
        firstName: first,
        club: at(roles.club),
        category: categoryParts || currentCategory,
        // A dossard is a small number. The column is chosen because most of it
        // looks like one, so the odd cell that does not — a time, a note — must
        // not be stored as a bib: it is too long for the column and takes the
        // whole article's list down with it.
        bib: /^\d{1,4}$/.test(at(roles.bib) ?? "") ? at(roles.bib) : null,
      });
    }
  });

  return entrants;
}

/**
 * Candidate commune names for a slug prefix.
 *
 * The prefix mixes the commune with the race's own name
 * ("coron-gp-cycliste-de-la-st-louis"), and there is no separator telling the
 * two apart. Rather than guess where the commune ends, every leading run of one
 * to four words is offered and the best match wins.
 */
function communeCandidates(prefix: string): string[] {
  const words = prefix.split(" ").filter(Boolean);
  const out: string[] = [];
  for (let n = 1; n <= Math.min(4, words.length); n++) {
    out.push(words.slice(0, n).join(" "));
  }
  return out;
}

/**
 * Sørensen–Dice on character bigrams.
 *
 * The same measure pg_trgm approximates, computed here so the comparison can
 * run against a name this codebase has already stripped rather than against
 * whatever is in the column.
 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (v: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < v.length - 1; i++) {
      const g = v.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;

  let shared = 0;
  for (const [g, n] of ga) shared += Math.min(n, gb.get(g) ?? 0);
  const total = [...ga.values()].reduce((x, y) => x + y, 0) +
                [...gb.values()].reduce((x, y) => x + y, 0);
  return (2 * shared) / total;
}

/** Words that carry no identity: dropped before comparing places. */
const PARTICLES = new Set([
  "de","du","des","la","le","les","l","d","en","sur","sous","au","aux","et",
  "a","the","prix","grand","gp","challenge","criterium","circuit","souvenir",
  "trophee","coupe","tour","manche","edition","course","cycliste","cyclistes",
]);

/** Abbreviations the two sources disagree about. */
function expand(token: string): string {
  if (token === "st") return "saint";
  if (token === "ste") return "sainte";
  return token;
}

function placeTokens(value: string): string[] {
  return value
    .split(/\s+/)
    .map(expand)
    .filter((t) => t.length > 0 && !PARTICLES.has(t));
}

/**
 * Does the shorter description sit inside the longer one?
 *
 * The press names a commune; the federation names the commune and then adds
 * whatever the organiser calls the race. "Coutances" against "Coutances - U15 -
 * challenge Savary" is the same place, but the extra words halve a similarity
 * score. Containment reads it correctly, and requiring a token of real length
 * keeps a stray "vay" from matching anything that happens to contain it.
 */
function containment(a: string, b: string): number {
  const ta = placeTokens(a);
  const tb = placeTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (!small.some((t) => t.length >= 3)) return 0;

  const inLarge = new Set(large);
  return small.every((t) => inLarge.has(t)) ? 0.95 : 0;
}

interface RaceLookup {
  races: Array<{ id: string; name: string; categories: string[] }>;
  /** How many races we hold on that date at all. */
  sameDayCount: number;
  bestName?: string;
  bestScore?: number;
  /** Carried so an unplaced list can propose the race it nearly matched. */
  bestRaceId?: string;
}

/**
 * Finds the race this start list belongs to.
 *
 * The date is exact, which narrows the field to a few dozen races, so the place
 * is compared by similarity — the press spells communes its own way, writing
 * "Trémusson" where the federation writes "Trémuson".
 *
 * The comparison is against the *meeting* name, not the race name. A race is
 * published per category, so its title carries a clause the press article never
 * has: "JAVENE - U15 H/F + U17 F" against "javene" scored 0.41 and "MESLAN -
 * ACCESS 1-2-3-4 H/F" against "meslan" scored 0.27, both of them the same
 * commune spelled identically. Stripping the clause with the function that
 * defines meeting identity is what makes the two comparable — and keeps one
 * definition of what a meeting is called.
 */
async function findRaces(prefix: string, date: Date): Promise<RaceLookup> {
  const iso = date.toISOString().split("T")[0];
  const candidates = communeCandidates(prefix);

  const rows = (await sql(
    `SELECT r.id, r.name, r.categories, lower(r.city) AS city,
            v.normalized_city AS venue_city
       FROM races r
       LEFT JOIN venues v ON v.id = r.venue_id
                          AND v.geo_precision <> 'department'
      WHERE r.race_date = $1::date`,
    [iso]
  )) as Array<Record<string, unknown>>;

  const scored = rows
    .map((row) => {
      const name = row.name as string;
      const haystacks = [
        meetingKey(name),
        (row.venue_city as string | null) ?? "",
        (row.city as string | null) ?? "",
      ].filter((h) => h && h !== "lieu à préciser");

      let score = 0;
      for (const cand of candidates) {
        for (const hay of haystacks) {
          score = Math.max(score, similarity(cand, hay), containment(cand, hay));
        }
      }
      return {
        id: row.id as string,
        name,
        categories: (row.categories as string[]) ?? [],
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Below this the "match" is coincidence; a start list attached to the wrong
  // race is worse than none.
  const MIN_SCORE = 0.62;
  const best = scored[0];

  return {
    races: scored.filter((r) => r.score >= MIN_SCORE),
    sameDayCount: scored.length,
    bestName: best?.name,
    bestScore: best?.score,
    bestRaceId: best?.id,
  };
}

/** Picks the race whose categories best fit the start-list section. */
function pickRace(
  races: Array<{ id: string; name: string; categories: string[] }>,
  category: string | null
): { id: string; name: string } | null {
  if (races.length === 0) return null;
  if (races.length === 1 || !category) return races[0];

  const wanted = normalizeName(category);
  const digits = wanted.match(/\d/g) ?? [];

  let best = races[0];
  let bestScore = -1;

  for (const race of races) {
    const haystack = normalizeName(
      `${race.name} ${race.categories.join(" ")}`
    );
    let score = 0;
    if (wanted.includes("access") && haystack.includes("access")) score += 2;
    if (wanted.includes("open") && haystack.includes("open")) score += 2;
    if (wanted.includes("elite") && haystack.includes("elite")) score += 2;
    for (const d of digits) if (haystack.includes(d)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = race;
    }
  }

  return best;
}

interface RiderMatch {
  riderId: string | null;
  method: "name_and_club" | "name_only" | "unmatched";
}

/**
 * Resolves a whole start list's entrants against known riders in one query.
 *
 * A query per entrant meant thousands of sequential round trips, which
 * exhausted the connection partway through a run. Every name in the article is
 * now looked up at once and the decisions are made in memory.
 *
 * A single name match is accepted only when nothing else shares that name;
 * where several riders do, the club decides, and if it cannot the entry stays
 * unmatched rather than guessing — a wrong link would silently attribute
 * someone else's palmarès.
 */
async function matchRiders(
  entrants: Entrant[]
): Promise<Map<string, RiderMatch>> {
  const wanted = new Map<string, Entrant>();
  for (const entrant of entrants) {
    const key = normalizeName(`${entrant.lastName} ${entrant.firstName ?? ""}`);
    if (key) wanted.set(key, entrant);
  }

  const out = new Map<string, RiderMatch>();
  if (wanted.size === 0) return out;

  const rows = await sql(
    `SELECT r.id, r.normalized_name, c.name AS club_name
       FROM riders r
       LEFT JOIN clubs c ON c.id = r.current_club_id
      WHERE r.normalized_name = ANY($1::text[])`,
    [[...wanted.keys()]]
  );

  const byName = new Map<string, Array<{ id: string; club: string }>>();
  for (const row of rows) {
    const key = row.normalized_name as string;
    const list = byName.get(key) ?? [];
    list.push({
      id: row.id as string,
      club: normalizeName((row.club_name as string) ?? ""),
    });
    byName.set(key, list);
  }

  for (const [key, entrant] of wanted) {
    const candidates = byName.get(key);

    if (!candidates || candidates.length === 0) {
      out.set(key, { riderId: null, method: "unmatched" });
      continue;
    }
    if (candidates.length === 1) {
      out.set(key, { riderId: candidates[0].id, method: "name_only" });
      continue;
    }

    const club = normalizeName(entrant.club ?? "");
    const onClub = club
      ? candidates.find((c) => c.club && c.club === club)
      : undefined;

    out.set(
      key,
      onClub
        ? { riderId: onClub.id, method: "name_and_club" }
        : { riderId: null, method: "unmatched" }
    );
  }

  return out;
}

/** Why a published start list could not be attached to a race we hold. */
type Miss =
  | "unreadable-slug"
  | "no-race-that-day"
  | "below-threshold"
  | "no-entrants";

interface Ingested {
  stored: number;
  matched: number;
  race: string | null;
  miss?: Miss;
  /** What the source said, so an unattached list can still be reviewed. */
  commune?: string;
  date?: string;
  bestCandidate?: string;
  bestScore?: number;
  bestRaceId?: string;
}

async function ingestArticle(path: string, dryRun: boolean): Promise<Ingested> {
  const slug = path.split("/").pop() ?? "";
  const parsed = parseSlug(slug);
  if (!parsed) return { stored: 0, matched: 0, race: null, miss: "unreadable-slug" };

  const iso = parsed.date.toISOString().split("T")[0];

  // A correction made once from /etat is obeyed from then on. This is what
  // makes the queue a queue: each arbitration removes a list from it for good
  // rather than for one night.
  const [override] = await sql(
    `SELECT r.id, r.name, r.categories
       FROM startlist_misses m JOIN races r ON r.id = m.resolved_race_id
      WHERE m.source_path = $1 AND m.resolved_race_id IS NOT NULL`,
    [path]
  );

  const found: RaceLookup = override
    ? {
        races: [
          {
            id: override.id as string,
            name: override.name as string,
            categories: (override.categories as string[]) ?? [],
          },
        ],
        sameDayCount: 1,
      }
    : await findRaces(parsed.commune, parsed.date);

  if (found.races.length === 0) {
    return {
      stored: 0,
      matched: 0,
      race: null,
      // Distinguishing these two is the whole point: one means the race is
      // outside our coverage, the other means our matching is too strict.
      miss: found.sameDayCount === 0 ? "no-race-that-day" : "below-threshold",
      commune: parsed.commune,
      date: iso,
      bestCandidate: found.bestName,
      bestScore: found.bestScore,
      bestRaceId: found.bestRaceId,
    };
  }

  const races = found.races;

  const html = await fetchHtml(`${BASE_URL}${path}`);
  const entrants = parseEntrants(html);
  if (entrants.length === 0) {
    return { stored: 0, matched: 0, race: null, miss: "no-entrants", commune: parsed.commune, date: iso };
  }

  const target = pickRace(races, entrants[0].category);
  if (!target) {
    return { stored: 0, matched: 0, race: null, miss: "below-threshold", commune: parsed.commune, date: iso };
  }

  const matches = await matchRiders(entrants);

  const raceIds: string[] = [];
  const riderIds: (string | null)[] = [];
  const bibs: (string | null)[] = [];
  const lastNames: string[] = [];
  const firstNames: (string | null)[] = [];
  const clubs: (string | null)[] = [];
  const categories: (string | null)[] = [];
  const methods: string[] = [];
  const seen = new Set<string>();

  let matched = 0;

  for (const entrant of entrants) {
    const key = normalizeName(`${entrant.lastName} ${entrant.firstName ?? ""}`);
    const match = matches.get(key) ?? { riderId: null, method: "unmatched" as const };
    if (match.riderId) matched++;

    // The unique index is on (race, surname, given name); a name repeated in one
    // article must be sent once or the statement would touch a row twice.
    const dedupKey = `${entrant.lastName.toLowerCase()}|${(entrant.firstName ?? "").toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    raceIds.push(target.id);
    riderIds.push(match.riderId);
    bibs.push(entrant.bib);
    lastNames.push(entrant.lastName);
    firstNames.push(entrant.firstName);
    clubs.push(entrant.club);
    categories.push(entrant.category);
    methods.push(match.method);
  }

  if (dryRun || raceIds.length === 0) {
    return { stored: raceIds.length, matched, race: target.name };
  }

  // Marks this pass, so what the article no longer says can be removed below.
  const [{ now: passStartedAt }] = (await sql(
    `SELECT now() AS now`
  )) as unknown as Array<{ now: string }>;

  await sql(
    `INSERT INTO engagements
       (race_id, rider_id, bib, last_name_raw, first_name_raw,
        club_name_raw, category_raw, match_method, source_url, source)
     SELECT d.*, $9::text, 'velopressecollection'
       FROM UNNEST($1::uuid[], $2::uuid[], $3::varchar[], $4::varchar[],
                   $5::varchar[], $6::varchar[], $7::varchar[], $8::varchar[]) AS d
     ON CONFLICT (race_id, lower(coalesce(last_name_raw, '')), lower(coalesce(first_name_raw, '')))
     DO UPDATE SET
       rider_id      = COALESCE(EXCLUDED.rider_id, engagements.rider_id),
       bib           = COALESCE(EXCLUDED.bib, engagements.bib),
       club_name_raw = EXCLUDED.club_name_raw,
       category_raw  = EXCLUDED.category_raw,
       match_method  = EXCLUDED.match_method,
       observed_at   = now()`,
    [
      raceIds, riderIds, bibs, lastNames, firstNames,
      clubs, categories, methods, `${BASE_URL}${path}`,
    ]
  );

  // The published list is the truth about itself. An entrant this article no
  // longer names is a row from an earlier, worse reading of the same page —
  // which is how thousands of surnames with no given name survived a fixed
  // parser: re-reading the article wrote correct rows beside the broken ones
  // instead of replacing them.
  //
  // Scoped to this article, not to the race: two articles can cover the same
  // race, one category each, and neither is entitled to delete the other.
  await sql(
    `DELETE FROM engagements
      WHERE race_id = $1 AND source_url = $2 AND observed_at < $3`,
    [target.id, `${BASE_URL}${path}`, passStartedAt]
  );

  return { stored: raceIds.length, matched, race: target.name };
}

async function collectArticleLinks(pages: number): Promise<string[]> {
  const links = new Set<string>();

  for (const section of SECTIONS) {
    for (let page = 1; page <= pages; page++) {
      const url =
        page === 1
          ? `${BASE_URL}/${section}/engages/`
          : `${BASE_URL}/${section}/engages/page-${page}.html`;

      let html: string;
      try {
        html = await fetchHtml(url);
      } catch {
        break;
      }

      const found = [...html.matchAll(/href="([^"]*engages[^"]*\.html)"/g)]
        .map((m) => m[1])
        .filter((href) => /\/\d+-/.test(href) || /^\d+-/.test(href));

      if (found.length === 0) break;

      for (const href of found) {
        const path = href.startsWith("/")
          ? href
          : `/${section}/engages/${href}`;
        links.add(path);
      }

      await politeDelay(250);
    }
  }

  return [...links];
}

/**
 * Records a start list we could not place, so it can be arbitrated later.
 *
 * Keyed on the article path rather than on the date and commune: the same
 * article is re-read every night, and the queue should hold one row per list,
 * not one per attempt. `last_seen_at` says whether the source still publishes
 * it — a list that stops appearing is no longer worth anyone's time.
 */
async function queueMiss(
  path: string,
  result: Ingested,
  reason: string
): Promise<void> {
  await sql(
    `INSERT INTO startlist_misses
       (source_path, race_date, commune, miss_reason, best_race_id, best_score)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_path) DO UPDATE
        SET last_seen_at = now(),
            miss_reason  = EXCLUDED.miss_reason,
            best_race_id = EXCLUDED.best_race_id,
            best_score   = EXCLUDED.best_score`,
    [
      path,
      result.date ?? null,
      result.commune ?? null,
      reason,
      result.bestRaceId ?? null,
      result.bestScore ?? null,
    ]
  );
}

/** The list found its race — by our matching or by an arbitration. */
async function closeMiss(path: string): Promise<void> {
  await sql(
    `UPDATE startlist_misses
        SET resolved_at = COALESCE(resolved_at, now()), last_seen_at = now()
      WHERE source_path = $1 AND resolved_at IS NULL`,
    [path]
  );
}

async function main() {
  const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
  const pages = pagesArg ? Number(pagesArg.split("=")[1]) : 6;
  const dryRun = process.argv.includes("--dry-run");

  console.log(`Collecting start lists (${pages} index pages per section)...`);
  const links = await collectArticleLinks(pages);
  console.log(`${links.length} articles found.\n`);

  let stored = 0;
  let matched = 0;
  let linkedRaces = 0;
  let unmatchedRaces = 0;
  /** Why the rest could not be placed — a count that is actionable. */
  const misses = new Map<string, number>();
  const nearMisses: string[] = [];

  for (const path of links) {
    try {
      const result = await ingestArticle(path, dryRun);
      if (result.race) {
        linkedRaces++;
        if (!dryRun) await closeMiss(path);
        stored += result.stored;
        matched += result.matched;
        if (linkedRaces <= 12) {
          console.log(
            `  ${result.race.slice(0, 46).padEnd(48)} ${String(result.stored).padStart(3)} entrants, ${result.matched} matched`
          );
        }
      } else {
        unmatchedRaces++;
        const reason = result.miss ?? "below-threshold";
        misses.set(reason, (misses.get(reason) ?? 0) + 1);
        if (!dryRun) await queueMiss(path, result, reason);
        if (reason === "below-threshold" && nearMisses.length < 15) {
          nearMisses.push(
            `  ${result.date} ${(result.commune ?? "?").padEnd(24)} ` +
              `best ${(result.bestScore ?? 0).toFixed(2)} — ${(result.bestCandidate ?? "").slice(0, 40)}`
          );
        }
      }
    } catch (err) {
      console.error(
        `  ${path}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    await politeDelay(250);
  }

  const pct = stored > 0 ? Math.round((matched / stored) * 100) : 0;
  console.log(
    `\n${linkedRaces} start lists attached to a known race, ${unmatchedRaces} with no match.\n` +
      `${stored} entrants stored, ${matched} linked to a rider (${pct}%).`
  );

  if (misses.size > 0) {
    console.log("\nwhy the rest could not be placed:");
    for (const [reason, n] of [...misses].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason.padEnd(20)} ${n}`);
    }
  }
  if (nearMisses.length > 0) {
    console.log("\nnear misses — a race exists that day, the name did not agree:");
    for (const line of nearMisses) console.log(line);
  }

  // Counted in start lists rather than entrants: a run that finds 263 lists
  // and can place 30 of them is the failure worth seeing.
  return {
    seen: linkedRaces + unmatchedRaces,
    written: linkedRaces,
    metadata: { entrants: stored, ridersLinked: matched, unmatchedRaces },
  };
}

/**
 * Wrapped so the run is recorded whichever way it ends — including the way
 * that used to be invisible, where it simply never started.
 */
async function tracked() {
  const run = await startRun(sql, "engagements");
  try {
    const totals = await main();
    await run.finish(totals);
  } catch (err) {
    await run.fail(err);
    throw err;
  }
}

// Only when run as the script. `parseEntrants` is exported so a table layout can
// be checked against a real article without setting the whole collector going.
if (process.argv[1]?.includes("velopresse-engagements")) {
  tracked().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
