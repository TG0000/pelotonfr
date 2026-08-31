/**
 * What an organiser writes on their own competition page.
 *
 * Three facts live there and nowhere else: where a dossard is collected, at
 * what time, and — when the organiser bothers — the circuit itself, stated as
 * "circuit de 7 km à parcourir 11 fois".
 *
 * That last one is the number the circuit search has always been missing. A
 * loop found among Strava's segments is otherwise judged on its shape and how
 * close it passes, which is how a race at Argentan was handed the neighbouring
 * commune's circuit. Against a stated lap, a candidate either matches or it
 * does not.
 *
 * The parsing is deliberately loose about whitespace: the page breaks lines
 * inside words, and "à parcourir" arrives as "à par courir".
 */

export interface Briefing {
  /** "13h00", as written. */
  bibPickupTime: string | null;
  /** "caravane sono", "Rue du Champ Passais", "Salle des Fêtes". */
  bibPickupPlace: string | null;
  /** One lap, in metres. */
  circuitM: number | null;
  lapCount: number | null;
  /**
   * When entries close, as the federation states it — "2026-08-25T20:00".
   *
   * The single most useful date on the page for a French amateur, and the one
   * nobody sees in time. A licensed rider cannot enter a FFC race themselves:
   * the club officer holds the account, so a rider who decides on Wednesday
   * for Sunday has already missed it.
   */
  entriesCloseAt: string | null;
}

/** Words that end a pickup place — the page runs sections together. */
const PLACE_STOP =
  /\b(?:liste des arbitres|listes? d'engagements?|engagements?|documents?|contacter|informations?|circuit de|d[ée]part\s*:|horaires?\s*:|briefing)/i;

function tidyPlace(raw: string): string | null {
  /* La page colle les sections : « mairieDépart : 13h45 ». Sans espace il n'y a
     pas de frontière de mot, la coupure ne se déclenche pas, et le lieu emporte
     l'horaire du départ avec lui. On décolle avant de couper. */
  let place = raw
    .replace(/\s+/g, " ")
    .replace(
      /([a-zàâçéèêëîïôûùüÿñ0-9])(D[ée]part|Horaire|Briefing|Remise|Engagement)/g,
      "$1 $2"
    )
    .split(PLACE_STOP)[0];

  /* Peel the front until nothing peels.
     Organisers repeat the label and the hour inside the place itself —
     "Remise de dossards Dossards : 11h15 Gymnase Chevalier" — and the page runs
     fields together with a stray slash. One pass left "Dossards : 11h15" in
     front of the gymnasium; peeling until it stops leaves the gymnasium. */
  for (let i = 0; i < 4; i++) {
    const before = place;
    place = place
      .replace(/^[\s:/–—,.-]+/, "")
      .replace(/^(?:remise\s+des?\s+)?dossards?\s*:?\s*/i, "")
      .replace(/^(?:à\s*)?\d{1,2}\s*h\s*\d{0,2}\s*/i, "");
    if (place === before) break;
  }

  place = place.trim().replace(/[.,;/]+$/, "");

  // A single letter or a stray digit is the tail of something else.
  if (place.length < 3 || place.length > 150) return null;
  return place;
}

export function parseBriefing(pageText: string): Briefing {
  const text = pageText.replace(/\s+/g, " ");

  /* "Remise de dossards 12h00 Rue du Champ Passais", and the shorter
     "Dossards : 19h30 Boulevard de la Tour" that some organisers write. */
  const pickup = text.match(
    /(?:remise\s+des?\s+dossards?|dossards?)\s*:?\s*(?:à\s*)?(\d{1,2}\s*h\s*\d{0,2})?\s*(.{0,80})/i
  );

  let bibPickupTime: string | null = null;
  let bibPickupPlace: string | null = null;
  if (pickup) {
    if (pickup[1]) bibPickupTime = pickup[1].replace(/\s+/g, "").toLowerCase();
    /* The hour is not always where the label puts it. "Remise de dossards
       Dossards : 11h15 Gymnase Chevalier" repeats the label first, so the
       capture above comes back empty and the hour is inside the place — where
       tidying would throw it away. Read it before tidying. */
    if (!bibPickupTime) {
      const inside = (pickup[2] ?? "").match(/(\d{1,2}\s*h\s*\d{0,2})/);
      if (inside) bibPickupTime = inside[1].replace(/\s+/g, "").toLowerCase();
    }
    bibPickupPlace = tidyPlace(pickup[2] ?? "");
  }

  /* "circuit de 7 km à parcourir 11 fois". The unit is sometimes metres, the
     verb is sometimes broken across a line, and a few write "boucle". */
  const circuit = text.match(
    /(?:circuit|boucle|parcours)\s+de\s+([\d]{1,5}(?:[.,]\d{1,3})?)\s*(km|kms|m|metres|mètres)\b(?:[^.]{0,40}?(?:parcourir|par\s*courir|effectuer|faire)\s*(\d{1,2})\s*fois)?/i
  );

  let circuitM: number | null = null;
  let lapCount: number | null = null;
  if (circuit) {
    const value = Number(circuit[1].replace(",", "."));
    const metres = /^m/i.test(circuit[2]) ? value : value * 1_000;
    // Under a kilometre it is a finishing straight, over forty a whole race.
    if (metres >= 800 && metres <= 40_000) circuitM = Math.round(metres);
    if (circuit[3]) {
      const laps = Number(circuit[3]);
      if (laps >= 1 && laps <= 60) lapCount = laps;
    }
  }

  /* "Engagements fermés depuis le 25/08/2026 20h local", and the same sentence
     in the future tense while they are still open. */
  const close = text.match(
    /engagements?\s+(?:ferm[ée]s?|ouverts?)[^0-9]{0,40}(\d{2})\/(\d{2})\/(\d{4})\s*(\d{1,2})\s*h/i
  );
  const entriesCloseAt = close
    ? `${close[3]}-${close[2]}-${close[1]}T${close[4].padStart(2, "0")}:00`
    : null;

  return { bibPickupTime, bibPickupPlace, circuitM, lapCount, entriesCloseAt };
}
