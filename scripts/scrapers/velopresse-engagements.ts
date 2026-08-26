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
  const cleaned = raw.replace(/\s+/g, " ").trim();
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

  // A surname column is written in capitals; the given name beside it is not.
  for (let k = 0; k < remaining.length - 1; k++) {
    const a = columns[remaining[k]];
    const b = columns[remaining[k + 1]];
    const aCaps = share(a, (v) => ALL_CAPS_RE.test(v));
    const bCaps = share(b, (v) => ALL_CAPS_RE.test(v));
    const bSingleWord = share(b, (v) => v.split(" ").length <= 2);
    if (aCaps > 0.8 && bCaps < 0.4 && bSingleWord > 0.6) {
      roles.lastName = remaining[k];
      roles.firstName = remaining[k + 1];
      taken.add(remaining[k]);
      taken.add(remaining[k + 1]);
      break;
    }
  }

  if (roles.lastName === undefined) {
    const nameCol = remaining.find(
      (i) => !taken.has(i) && share(columns[i], (v) => /[A-Za-zÀ-ÿ]/.test(v)) > 0.8
    );
    if (nameCol !== undefined) {
      roles.fullName = nameCol;
      taken.add(nameCol);
    }
  }

  if (roles.club === undefined) {
    const clubCol = columns
      .map((_, i) => i)
      .find((i) => !taken.has(i) && share(columns[i], (v) => v.length > 3) > 0.6);
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
        bib: at(roles.bib),
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
 * Finds the race this start list belongs to.
 *
 * The date is exact, which narrows the field to a handful of races, so the
 * commune is compared by similarity rather than equality — the press spells
 * places its own way ("tremusson" for Trémuson) and an exact match throws away
 * most of the source.
 */
async function findRaces(
  prefix: string,
  date: Date
): Promise<Array<{ id: string; name: string; categories: string[] }>> {
  const iso = date.toISOString().split("T")[0];
  const candidates = communeCandidates(prefix);

  const rows = await sql(
    `WITH cand AS (SELECT unnest($3::text[]) AS c)
     SELECT r.id, r.name, r.categories,
            GREATEST(
              COALESCE((SELECT MAX(similarity(v.normalized_city, cand.c)) FROM cand), 0),
              COALESCE((SELECT MAX(similarity(lower(r.city), cand.c)) FROM cand), 0),
              similarity(lower(r.name), $2)
            ) AS score
       FROM races r
       LEFT JOIN venues v ON v.id = r.venue_id
      WHERE r.race_date = $1::date
      ORDER BY score DESC
      LIMIT 12`,
    [iso, prefix, candidates]
  );

  // Below this the "match" is coincidence; a start list attached to the wrong
  // race is worse than none.
  const MIN_SCORE = 0.62;

  return rows
    .filter((row) => Number((row as { score: unknown }).score) >= MIN_SCORE)
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        name: r.name as string,
        categories: (r.categories as string[]) ?? [],
      };
    });
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

async function ingestArticle(
  path: string,
  dryRun: boolean
): Promise<{ stored: number; matched: number; race: string | null }> {
  const slug = path.split("/").pop() ?? "";
  const parsed = parseSlug(slug);
  if (!parsed) return { stored: 0, matched: 0, race: null };

  const races = await findRaces(parsed.commune, parsed.date);
  if (races.length === 0) return { stored: 0, matched: 0, race: null };

  const html = await fetchHtml(`${BASE_URL}${path}`);
  const entrants = parseEntrants(html);
  if (entrants.length === 0) return { stored: 0, matched: 0, race: null };

  const target = pickRace(races, entrants[0].category);
  if (!target) return { stored: 0, matched: 0, race: null };

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

  for (const path of links) {
    try {
      const result = await ingestArticle(path, dryRun);
      if (result.race) {
        linkedRaces++;
        stored += result.stored;
        matched += result.matched;
        if (linkedRaces <= 12) {
          console.log(
            `  ${result.race.slice(0, 46).padEnd(48)} ${String(result.stored).padStart(3)} entrants, ${result.matched} matched`
          );
        }
      } else {
        unmatchedRaces++;
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

tracked().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
