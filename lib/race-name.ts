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
export function displayRaceName(name: string): string {
  return name
    .split(/(\s+)/)
    .map((token, i) => {
      if (/^\s+$/.test(token) || !isShouted(token)) return token;
      return titleCaseWord(token, i === 0);
    })
    .join("");
}
