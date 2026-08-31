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

/**
 * Une étape d'une course par étapes.
 *
 * La fédération modélise un tour comme une seule compétition sur plusieurs
 * jours, et décrit ses étapes en texte libre dans le descriptif :
 *
 *   le 12 septembre : Etape 1 : La Ferrière Bochard - Briouze 124 km - en ligne
 *   le 13 septembre : Etape 2 : CLM : Rânes - Rânes - 13 km
 *   Etape 3 : Rânes - Bagnoles de L'Orne - 103.50 km - Epreuve en ligne
 *
 * C'est la seule description qui existe, et ce sont les courses qui demandent
 * la préparation la plus longue : trois parcours différents, dont un
 * contre-la-montre, et un tracé qui change d'une année sur l'autre.
 */
export interface Stage {
  number: number;
  /** Le jour, quand le descriptif le dit — « 12 septembre ». */
  day: string | null;
  from: string | null;
  to: string | null;
  distanceKm: number | null;
  /** Un contre-la-montre ne se prépare pas comme une course en ligne. */
  kind: "ligne" | "clm" | null;
}

/** Le mois écrit en toutes lettres, tel que la fédération l'écrit. */
const MONTH_WORDS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10,
  novembre: 11, décembre: 12, decembre: 12,
};

export function parseStages(pageText: string, year: number): Stage[] {
  const text = pageText.replace(/\s+/g, " ");

  const found: Stage[] = [];
  let currentDay: string | null = null;

  /* La fiche décrit chaque étape deux fois : le descriptif donne l'horaire et
     l'adresse du départ, l'itinéraire donne les communes et la distance. On
     lit les deux passages et on garde, par étape, la lecture la plus riche —
     prendre la première revenait à ne jamais voir les kilomètres. */
  /* Le corps d'une étape va jusqu'à la suivante, et les fiches ne mettent
     pas toujours d'espace entre les deux — « …FlamanvilleEtape 2 ». Il faut
     de la marge : Cherbourg décrit ses boucles sur trois cents caractères. */
  const tokens = text.matchAll(
    /(?:le\s+(\d{1,2})\s+([a-zéûôA-Z]+)\s*:?\s*)|(?:[EÉ]tape\s+(\d{1,2})\s*:?\s*([^]{0,400}?)(?=\s*(?:[EÉ]tape\s+\d|le\s+\d{1,2}\s+[a-zéûô]+\s*:|Remise|Listes|Descriptif|Itin[ée]raire|$)))/gi
  );

  for (const t of tokens) {
    if (t[1] && t[2]) {
      const month = MONTH_WORDS[t[2].toLowerCase()];
      if (month) {
        currentDay = `${year}-${String(month).padStart(2, "0")}-${t[1].padStart(2, "0")}`;
      }
      continue;
    }
    if (!t[3]) continue;

    const body = (t[4] ?? "").trim();
    if (!body) continue;

    const distance = body.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*km/i);
    const clm = /\bCLM\b|contre[- ]la[- ]montre/i.test(body);

    /* « Rânes - Bagnoles de L'Orne - 103.50 km » : les deux communes sont
       avant la distance, séparées par un tiret. Le reste — « Epreuve en
       ligne », « Arrivée rue de… » — n'est pas un lieu. */
    const beforeDistance = distance
      ? body.slice(0, body.indexOf(distance[0]))
      : body;
    const places = beforeDistance
      .replace(/^\s*(?:CLM|contre[- ]la[- ]montre)\s*:?\s*/i, "")
      .split(/\s+[-–]\s+/)
      .map((p) => p.trim())
      .filter(
        (p) =>
          p.length > 1 &&
          !/^(?:arriv|d[ée]part|podium|circuit|[ée]preuve)/i.test(p) &&
          !/\d\s*h/i.test(p)
      );

    found.push({
      number: Number(t[3]),
      day: currentDay,
      from: places[0] ?? null,
      to: places[1] ?? null,
      distanceKm: distance ? Number(distance[1].replace(",", ".")) : null,
      kind: clm ? "clm" : /en ligne/i.test(body) ? "ligne" : null,
    });
  }

  /** Ce qui compte dans une lecture : la distance d'abord, les communes ensuite. */
  const richness = (s: Stage) =>
    (s.distanceKm != null ? 4 : 0) +
    (s.from ? 2 : 0) +
    (s.to ? 1 : 0) +
    (s.kind ? 1 : 0);

  const best = new Map<number, Stage>();
  for (const stage of found) {
    const kept = best.get(stage.number);
    if (!kept) {
      best.set(stage.number, stage);
      continue;
    }
    // Le jour vient souvent de l'itinéraire seul : on le reprend au passage.
    const winner = richness(stage) > richness(kept) ? stage : kept;
    best.set(stage.number, { ...winner, day: winner.day ?? kept.day ?? stage.day });
  }

  return [...best.values()].sort((a, b) => a.number - b.number);
}
