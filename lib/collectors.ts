/**
 * Ce que sont les collecteurs, et ce qu'on attend de chacun.
 *
 * Écrit en code plutôt qu'en base, pour que l'attente voyage avec le script
 * qu'elle décrit : ajouter un collecteur sans déclarer sa cadence est une
 * erreur de compilation, pas un trou silencieux dans la surveillance.
 *
 * Trois natures, parce qu'un même ratio ne veut pas dire la même chose
 * partout. Un calendrier qui voit mille sept cents courses doit en garder
 * mille sept cents : l'écart est une panne. Une fiche d'organisateur qu'on
 * ouvre pour voir si elle dit quelque chose de neuf ne dit rien neuf fois sur
 * dix : l'écart est la normale, et le signaler chaque nuit apprend à ignorer
 * le rouge. Un contrôle de cohérence, lui, ne « ramène » rien du tout.
 */

export type CollectorKind =
  /** Tout ce qui est vu doit être gardé : un écart est une panne. */
  | "harvest"
  /** On examine, et une minorité donne quelque chose : c'est le rendement sur
      plusieurs jours qui parle, pas le ratio d'une nuit. */
  | "scan"
  /** Répare ou vérifie l'existant : seules la fraîcheur et les échecs comptent. */
  | "maintenance";

export interface CollectorSpec {
  /** Correspond à la colonne `collector` écrite par scripts/lib/track-run.ts. */
  key: string;
  /** Ce qu'un coureur dirait que ça rapporte. */
  label: string;
  kind: CollectorKind;
  /**
   * La commande npm qui le lance, ou `null` s'il ne se lance qu'à la main.
   *
   * Déclarée ici pour que les workflows et cette liste se vérifient l'un
   * l'autre : « Bosses Strava » a passé des jours en rouge parce qu'il était
   * déclaré et que plus aucun workflow ne l'appelait, et onze collecteurs qui
   * tournaient chaque nuit n'apparaissaient nulle part faute d'être déclarés.
   */
  command: string | null;
  /** Heures au-delà desquelles une collecte réussie est jugée en retard. */
  maxAgeHours: number;
  /** Au-delà, c'est une panne qui mérite un courriel, pas une remarque. */
  criticalAgeHours: number;
}

const SPECS = [
  // Le calendrier : ce qui fait exister une course sur le site.
  { key: "calendar-ffc",    label: "Calendrier FFC",         kind: "harvest", command: "scrape",               maxAgeHours: 36,  criticalAgeHours: 96 },
  { key: "calendar-fsgt",   label: "Calendrier FSGT",        kind: "harvest", command: "scrape",               maxAgeHours: 36,  criticalAgeHours: 96 },
  { key: "calendar-ufolep", label: "Calendrier UFOLEP",      kind: "harvest", command: "scrape",               maxAgeHours: 36,  criticalAgeHours: 96 },
  { key: "ffc-history",     label: "Courses récentes",       kind: "harvest", command: "scrape:history",       maxAgeHours: 48,  criticalAgeHours: 120 },
  { key: "ffc-results",     label: "Résultats",              kind: "harvest", command: "scrape:results",       maxAgeHours: 48,  criticalAgeHours: 120 },
  { key: "ffc-rankings",    label: "Classements nationaux",  kind: "harvest", command: "scrape:rankings",      maxAgeHours: 72,  criticalAgeHours: 240 },
  { key: "engagements",     label: "Listes d'engagés",       kind: "harvest", command: "scrape:engagements",   maxAgeHours: 36,  criticalAgeHours: 96 },
  { key: "forecast",        label: "Météo au départ",        kind: "harvest", command: "scrape:meteo",         maxAgeHours: 36,  criticalAgeHours: 96 },

  // Ce qu'on va chercher course par course, et qui ne répond pas toujours.
  { key: "ffc-briefing",       label: "Fiches organisateur",  kind: "scan", command: "scrape:briefing",      maxAgeHours: 48, criticalAgeHours: 168 },
  { key: "categories",         label: "Catégories FSGT/UFOLEP", kind: "scan", command: "scrape:categories",  maxAgeHours: 72, criticalAgeHours: 240 },
  { key: "affiches",           label: "Affiches de course",   kind: "scan", command: "scrape:affiches",      maxAgeHours: 72, criticalAgeHours: 240 },
  { key: "velopresse-guides",  label: "Guides techniques",    kind: "scan", command: "scrape:guides",        maxAgeHours: 72, criticalAgeHours: 240 },
  { key: "guide-vision",       label: "Lecture des guides",   kind: "scan", command: "scrape:guides:vision", maxAgeHours: 72, criticalAgeHours: 240 },
  { key: "road-vision",        label: "Lecture de la route",  kind: "scan", command: "scrape:road:vision",   maxAgeHours: 72, criticalAgeHours: 240 },
  { key: "streetview-coverage", label: "Street View",         kind: "scan", command: "scrape:streetview",    maxAgeHours: 72, criticalAgeHours: 240 },
  // Dans son propre workflow : neuf secondes et demie par lecture Strava, deux
  // heures et demie de budget, et seize nuits passées à être tué par le
  // délai du job de nuit avant qu'il n'en sorte.
  { key: "segment-circuits", label: "Circuits et bosses",     kind: "scan", command: "scrape:segments:index", maxAgeHours: 48, criticalAgeHours: 120 },
  { key: "strava-efforts",   label: "Sorties des coureurs",   kind: "scan", command: "scrape:efforts",        maxAgeHours: 48, criticalAgeHours: 120 },

  // L'entretien : rien de neuf n'entre, mais ce qui est là se corrige.
  { key: "place-from-name", label: "Communes lues dans le nom", kind: "maintenance", command: "db:place",          maxAgeHours: 48, criticalAgeHours: 168 },
  { key: "place-check",     label: "Contrôle des lieux",        kind: "maintenance", command: "db:place-check",    maxAgeHours: 48, criticalAgeHours: 168 },
  { key: "retype-cyclos",   label: "Cyclosportives à part",     kind: "maintenance", command: "db:retype-cyclos",  maxAgeHours: 48, criticalAgeHours: 168 },
  { key: "link-editions",   label: "Éditions reliées",          kind: "maintenance", command: "db:link-editions",  maxAgeHours: 48, criticalAgeHours: 168 },
  { key: "data-guard",      label: "Contrôle des données",      kind: "maintenance", command: "db:guard",          maxAgeHours: 48, criticalAgeHours: 168 },
  { key: "reidentify-events", label: "Ré-identification",       kind: "maintenance", command: "db:reidentify",     maxAgeHours: 720, criticalAgeHours: 2160 },

  // Lancés à la main quand une réparation le demande : suivis, jamais surveillés.
  { key: "relink-venues",       label: "Lieux reliés",          kind: "maintenance", command: null, maxAgeHours: 0, criticalAgeHours: 0 },
  { key: "reattach-startlists", label: "Listes rerattachées",   kind: "maintenance", command: null, maxAgeHours: 0, criticalAgeHours: 0 },
] as const satisfies readonly CollectorSpec[];

export const COLLECTORS: readonly CollectorSpec[] = SPECS;

/**
 * Le nom d'un collecteur, tel qu'il est déclaré.
 *
 * `startRun` ne prend que celui-là : ouvrir une ligne sous une clé qui n'est
 * pas dans la liste ci-dessus ne compile pas. C'est ce qui empêche un
 * collecteur d'exister sans que personne ne le surveille.
 */
export type CollectorKey = (typeof SPECS)[number]["key"];

const BY_KEY = new Map<string, CollectorSpec>(SPECS.map((s) => [s.key, s]));

export function collectorSpec(key: string): CollectorSpec | undefined {
  return BY_KEY.get(key);
}

/** Ceux qu'un workflow doit lancer, et que le contrôle de nuit surveille. */
export function scheduledCollectors(): readonly CollectorSpec[] {
  return SPECS.filter((s) => s.command !== null);
}

export type CollectorVerdict = "ok" | "late" | "overdue" | "never" | "off" | "manual";

export interface CollectorHealth extends CollectorSpec {
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  /** Le dernier passage : ce qu'il a vu, ce qu'il en a gardé. */
  itemsSeen: number | null;
  itemsWritten: number | null;
  /** La semaine écoulée, qui seule dit quelque chose d'un collecteur d'examen. */
  seenWeek: number;
  writtenWeek: number;
  runsWeek: number;
  ageHours: number | null;
  verdict: CollectorVerdict;
  /** Vu beaucoup, gardé presque rien — la panne qui sort en code zéro. */
  shortfall: boolean;
}

export function verdictFor(
  spec: CollectorSpec,
  ageHours: number | null,
  lastStatus?: string | null
): CollectorVerdict {
  if (spec.command === null) return "manual";
  /* Une sortie volontaire n'est pas une panne. La porte premium fermée, une
     clé absente : le collecteur le dit, et la page le dit à son tour plutôt
     que d'afficher un rouge que personne ne peut réparer. */
  if (lastStatus === "skipped") return "off";
  if (ageHours === null) return "never";
  if (ageHours > spec.criticalAgeHours) return "overdue";
  if (ageHours > spec.maxAgeHours) return "late";
  return "ok";
}

/**
 * L'écart qui compte, selon ce que le collecteur fait.
 *
 * Une moisson garde ce qu'elle voit : un passage qui voit deux cents courses
 * et en écrit dix est cassé, et il faut le dire le soir même. Un examen, lui,
 * ouvre des pages pour savoir si elles ont quelque chose à dire, et la plupart
 * n'ont rien : « 34 sur 1 393 » n'y est pas un écart, c'est le métier. Ce qui
 * est anormal pour lui, c'est une semaine entière sans rien rapporter.
 */
export function shortfallFor(
  kind: CollectorKind,
  last: { seen: number | null; written: number | null },
  week: { seen: number; written: number }
): boolean {
  if (kind === "maintenance") return false;
  if (kind === "harvest") {
    return last.seen != null && last.written != null && last.seen > 20 && last.written < last.seen * 0.5;
  }
  return week.seen > 50 && week.written === 0;
}

/** Français courant pour « il y a combien de temps ». */
export function describeAge(ageHours: number | null): string {
  if (ageHours === null) return "jamais";
  if (ageHours < 1) return "à l'instant";
  if (ageHours < 24) {
    const h = Math.round(ageHours);
    return `il y a ${h} h`;
  }
  const days = Math.round(ageHours / 24);
  return `il y a ${days} jour${days > 1 ? "s" : ""}`;
}
