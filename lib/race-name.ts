/**
 * Race names, made readable.
 *
 * The FFC publishes its calendar in capitals — "GRAND PRIX DE LA MUNICIPALITE
 * DE SAINT-GERMAIN-DU-CORBEIS" — and a list of those is a wall of shouting that
 * defeats the eye. The stored name stays exactly as the federation published
 * it, since that is what the scrapers compare and dedupe on; this is display
 * only.
 */

/** Kept as-is: capitalising these would be wrong, not merely ugly. */
const ACRONYMS = new Set([
  "GP", "CLM", "VTT", "BMX", "UCI", "FFC", "FSGT", "UFOLEP", "TT", "XC", "XCO",
  "XCM", "DH", "CX", "PC", "TRJV", "CD", "GF", "US", "AC", "UC", "VC", "EC",
  "ES", "SC", "CC", "ASPTT", "UFOLEP", "FSGT", "SMCD", "TDF", "PRO", "ZAC",
]);

/** French particles stay lowercase inside a name. */
const PARTICLES = new Set([
  "de", "du", "des", "d", "la", "le", "les", "l", "et", "en", "sur", "sous",
  "au", "aux", "à", "a", "par", "pour", "dans", "vers", "chez",
]);

/**
 * Roman numerals mark an edition — "XXII Grand Prix" — and stay as written.
 *
 * Matched against the actual numeral grammar rather than just the letter set:
 * "CIVIL" and "MIDI" are built entirely from roman letters, and a set test
 * would have left both shouting.
 */
const ROMAN = /^M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** True when a token is shouted: two or more letters, none of them lowercase. */
function isShouted(word: string): boolean {
  const letters = word.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return letters.length >= 2 && !/[a-zà-ÿ]/.test(letters);
}

/**
 * Title-cases one token, keeping hyphenated place names intact
 * ("SAINT-GERMAIN-DU-CORBEIS" → "Saint-Germain-du-Corbeis").
 */
function titleCaseWord(word: string, isFirst: boolean): string {
  if (ACRONYMS.has(word)) return word;
  if (word.length > 1 && ROMAN.test(word)) return word;
  // A token carrying digits is a number, an edition or a category code.
  if (/\d/.test(word)) return word;

  // "ROUTE/PISTE" is two words, and the second deserves its capital.
  if (word.includes("/")) {
    return word
      .split("/")
      .map((part) => titleCaseWord(part, true))
      .join("/");
  }

  if (word.includes("-")) {
    return word
      .split("-")
      .map((part, i) =>
        i > 0 && PARTICLES.has(part.toLowerCase())
          ? part.toLowerCase()
          : titleCaseWord(part, i === 0 && isFirst)
      )
      .join("-");
  }

  if (word.includes("'")) {
    // "L'AVENIR" → "l'Avenir": the article follows the particle rule, the noun
    // does not.
    const [head, ...rest] = word.split("'");
    const lead =
      !isFirst && PARTICLES.has(head.toLowerCase())
        ? head.toLowerCase()
        : capitalise(head);
    return [lead, ...rest.map((r) => capitalise(r))].join("'");
  }

  if (!isFirst && PARTICLES.has(word.toLowerCase())) return word.toLowerCase();
  return capitalise(word);
}

/**
 * The name as it should appear on screen.
 *
 * Decided token by token rather than on the whole string. Half these names are
 * a shouted place followed by a perfectly typed category list — "ARGENTRE DU
 * PLESSIS - Open 2-3 + Access 1-2" — and judging the name as a whole let that
 * tail keep the place shouting. Anything already mixed case is left exactly as
 * the organiser wrote it.
 */
/** « Tour », « Jours », « Étapes », « Boucles » : le nom d'une course par étapes. */
const STAGE_RACE_WORD = /\b(?:tour|jours?|[ée]tapes?|boucles?|ronde|circuit)\b/i;

/** Une commune : quelques mots, sans chiffre ni mot de course. */
function looksLikePlace(segment: string): boolean {
  const words = segment.trim().split(/\s+/);
  return (
    words.length >= 1 &&
    words.length <= 5 &&
    !/\d/.test(segment) &&
    !STAGE_RACE_WORD.test(segment) &&
    !/\b(?:open|access|elite|u\d|prix|championnat|trophée|trophee|coupe)\b/i.test(segment)
  );
}

/**
 * Le nom d'une course par étapes, sans ses villes-étapes.
 *
 * « La Ferrière Bochard - Bagnoles de l'Orne - 10èTour de l'Orne masculin -
 * Open 1-2-3 » : la fédération écrit le départ et l'arrivée avant le nom, ce
 * qui ne désigne qu'une étape — et pas la bonne. Quand des segments qui
 * ressemblent à des communes précèdent un segment qui nomme un tour, ce sont
 * eux qu'on retire ; le reste est le nom de la course.
 */
function withoutStageTowns(name: string): string {
  const segments = name.split(/\s+[-–]\s+/);
  if (segments.length < 3) return name;
  /* Le segment qui nomme le tour commence par lui — « 10èTour de l'Orne »,
     « 3 Jours de Cherbourg », « Tour de Moselle » — et n'est pas une
     catégorie : « U17 (course d'attente Tour de l'Orne) » est une course d'un
     après-midi à Briouze, et Briouze doit rester. */
  const raceAt = segments.findIndex((s) =>
    /^(?:\d+\s*(?:ᵉ|è|e|ème)?\s*)?(?:tour|jours?|[ée]tapes?|boucles?)\b/i.test(s.trim())
  );
  if (raceAt < 1) return name;
  if (!segments.slice(0, raceAt).every(looksLikePlace)) return name;
  return segments.slice(raceAt).join(" - ");
}

export function displayRaceName(name: string): string {
  return withoutStageTowns(name)
    // « 10èTour » : la fédération colle l'ordinal au mot.
    .replace(/(\d)(?:è|e|ème)(?=[A-Z][a-zé])/g, "$1ᵉ ")
    .split(/(\s+)/)
    .map((token, i) => {
      if (/^\s+$/.test(token) || !isShouted(token)) return token;
      return titleCaseWord(token, i === 0);
    })
    .join("");
}

/**
 * Le nom tel qu'il tient dans une case de calendrier.
 *
 * « Janze - Semi Nocturne - Open 2-3 + Access 1-2 H/F » : la moitié du nom est
 * la liste des catégories, que la carte de la course affiche déjà sous forme
 * de puces. Dans une case de trois centimètres, elle mange la place du nom.
 * On retire les segments qui ne sont qu'une catégorie et on garde le reste ;
 * le nom entier reste dans l'infobulle.
 */
const CATEGORY_SEGMENT =
  /^(?:(?:open|access|acc|elite|élite|pass|pass'?cyclisme|u\s?\d{1,2}|cadets?|juniors?|minimes?|benjamins?|pupilles?|poussins?|seniors?|masters?|femmes?|dames|feminines?|féminines?|h\/f|h et f|hommes?|toutes? cat[ée]gories?|[ée]coles? de v[ée]lo|[ée]cole de cyclisme|\d)[\s\d,.+\-/&àa]*)+$/i;

export function calendarName(name: string): string {
  const display = displayRaceName(name);
  const segments = display
    .split(/\s+[-–]\s+|\s*\(|\)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept = segments
    .map((s) => s.replace(/^[-–]\s*/, ""))
    .filter((s) => s && !CATEGORY_SEGMENT.test(s));
  // Un nom qui n'est qu'une catégorie garde son nom : mieux vaut « Open 2-3 »
  // que rien.
  return (kept.length > 0 ? kept : segments).join(" · ") || display;
}
