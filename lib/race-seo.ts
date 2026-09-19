import { CANONICAL_SITE_URL } from "@/lib/site-url";
import { displayRaceName } from "@/lib/race-name";
import { categoryLabel } from "@/lib/categories";
import { FEDERATIONS } from "@/lib/constants";
import type { Race } from "@/types";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Ce qu'un coureur tape dans Google, et ce que Google a besoin de lire.
 *
 * Personne ne cherche « Mantilly Open 2-3-access 1-2-3-4 ». On cherche
 * « course cycliste Mantilly », « calendrier FFC Orne », « course 27
 * septembre 61 ». Le titre et le résumé d'une fiche doivent donc porter la
 * commune, le département, la date en toutes lettres et la fédération, parce
 * que c'est là-dessus que la page sera trouvée ou pas.
 */

const DISCIPLINE_WORDS: Record<string, string> = {
  route: "course cycliste sur route",
  cyclocross: "cyclo-cross",
  vtt: "course VTT",
  gravel: "course gravel",
  piste: "course sur piste",
  bmx: "course BMX",
  cyclosportive: "cyclosportive",
  course_par_etapes: "course par étapes",
  contre_la_montre: "contre-la-montre",
  pump_track: "pump track",
};

/* Le titre n'a pas la place de tout dire : Google en montre une soixantaine
   de caractères, le nom du site compris. « Course cycliste sur route » en
   prend vingt-cinq à lui seul, pour un mot de plus que « course cycliste ». */
const DISCIPLINE_COURTE: Record<string, string> = {
  route: "course cycliste",
  cyclocross: "cyclo-cross",
  vtt: "VTT",
  gravel: "gravel",
  piste: "piste",
  bmx: "BMX",
  cyclosportive: "cyclosportive",
  course_par_etapes: "course par étapes",
  contre_la_montre: "contre-la-montre",
  pump_track: "pump track",
};

function dayInWords(iso: string): string {
  return format(new Date(`${iso}T12:00:00Z`), "EEEE d MMMM yyyy", { locale: fr });
}

/** « 27 septembre 2026 » : le jour de la semaine ne se cherche pas. */
function dayShort(iso: string): string {
  return format(new Date(`${iso}T12:00:00Z`), "d MMMM yyyy", { locale: fr });
}

/** « Mantilly (61) », ou le département seul quand la commune manque. */
export function placeWords(race: Race): string {
  const known = race.city && !/préciser/i.test(race.city);
  const code = race.departmentCode ? ` (${race.departmentCode})` : "";
  if (known) return `${race.city}${code}`;
  return race.departmentName ? `${race.departmentName}${code}` : "France";
}

/**
 * La commune seule, sans le numéro : le titre paie chaque caractère.
 *
 * `null` quand on ne sait pas où : « France — BMX du 31 octobre » ne dit
 * rien à personne et ne se cherche pas. Le titre mène alors avec le nom de
 * la course, qui reste la seule chose vraie qu'on ait.
 */
function townOnly(race: Race): string | null {
  const known = race.city && !/préciser/i.test(race.city);
  if (known) return race.city as string;
  if (race.departmentName) return race.departmentName;
  return race.departmentCode ? `Département ${race.departmentCode}` : null;
}

const sansAccents = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Retire une expression d'un texte sans se soucier des accents ni des tirets. */
function retirer(texte: string, expression: string): string {
  const nue = sansAccents(expression).replace(/[^a-z0-9]+/g, " ").trim();
  if (nue.length < 3) return texte;
  const motif = new RegExp(
    nue.split(" ").map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[ -]*"),
    "i"
  );
  const trouve = sansAccents(texte).match(motif);
  if (!trouve || trouve.index == null) return texte;
  return texte.slice(0, trouve.index) + texte.slice(trouve.index + trouve[0].length);
}

const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "a", "au", "aux", "et", "en", "sur", "ville", "grand", "prix", "gp"]);

/**
 * Ce qui reste du nom une fois la commune et la discipline retirées.
 *
 * Deux courses du même village le même jour — la fédération inscrit chaque
 * peloton séparément — auraient sinon le même titre, et deux pages qui
 * portent le même titre se concurrencent l'une l'autre. Ce reliquat, « U17 »
 * ou « Open 2-3 + Access 1-2 », les sépare. Il vient après la date, là où la
 * troncature ne coûte rien.
 *
 * Attention au piège inverse : « Cyclo-cross U15 » contient « cyclo-cross »,
 * mais c'est « U15 » qui distingue la page des trois autres épreuves du même
 * après-midi. On enlève la discipline, on garde ce qu'il y a autour.
 */
function nameTail(race: Race, town: string): string {
  const propre = (v: string) =>
    v.replace(/[\s\-–—()·,+]+/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();

  let tail = propre(retirer(retirer(displayRaceName(race.name), town), DISCIPLINE_COURTE[race.discipline] ?? ""));

  /* Ce qui ne dit plus rien ne sépare rien : « Cyclo-cross de la ville de »
     une fois la commune et la discipline parties, c'est une suite de mots
     vides qui allonge le titre sans distinguer la page. */
  const utiles = tail.split(" ").filter((m) => m && !MOTS_VIDES.has(sansAccents(m).replace(/[^a-z0-9]+/g, "")));
  if (utiles.length === 0) return "";
  tail = propre(utiles.join(" "));

  /* Au-delà d'une quarantaine de caractères, le reliquat n'est plus lu : il
     est coupé par le moteur, et un titre trop long se fait réécrire. */
  if (tail.length <= 40) return tail;
  const coupe = tail.slice(0, 40);
  const espace = coupe.lastIndexOf(" ");
  return propre(espace > 20 ? coupe.slice(0, espace) : coupe);
}

/**
 * Le titre, dans l'ordre où on le cherche.
 *
 * Il tenait le nom de la course en premier, puis la discipline, le lieu et
 * la date en toutes lettres : cent onze caractères en médiane, cent
 * soixante-dix-neuf au pire, pour une soixantaine d'affichés. Autrement dit
 * les mots qui font trouver la page — la commune, la date — étaient tous
 * coupés, et le jour de la semaine occupait la place pour rien.
 *
 * Et une course passée ne se cherche pas comme une course à venir : on tape
 * « résultats » et un millésime, pas une date.
 */
export function raceTitle(race: Race, past = false): string {
  const discipline = DISCIPLINE_COURTE[race.discipline] ?? "course cycliste";
  const town = townOnly(race);
  const tail = nameTail(race, town ?? "");
  const tete = town ?? displayRaceName(race.name);
  const suffixe = town && tail ? ` · ${tail}` : "";
  if (past) {
    return `Résultats ${discipline} ${tete} ${race.raceDate.slice(0, 4)}${suffixe}`;
  }
  return `${tete} — ${discipline} du ${dayShort(race.raceDate)}${suffixe}`;
}

/**
 * Le résumé sous le titre, dans le temps de la course.
 *
 * Avant, on vient voir le parcours, les catégories admises et la météo au
 * départ. Après, on vient chercher un classement — et la phrase doit le dire,
 * parce que c'est elle qui décide du clic quand deux pages se ressemblent.
 */
export function raceDescription(race: Race, past = false): string {
  const federation = FEDERATIONS.find((f) => f.slug === race.federationSlug)?.fullName ?? race.federationSlug.toUpperCase();
  const discipline = DISCIPLINE_WORDS[race.discipline] ?? "course cycliste";
  const cats = race.categories.length
    ? ` Catégories : ${race.categories.slice(0, 6).map(categoryLabel).join(", ")}.`
    : "";
  const distance = race.distanceKm ? ` ${race.distanceKm} km.` : "";
  /* Google n'en montre qu'environ cent soixante caractères. Ce qui décide du
     clic doit tenir dedans : pour une course passée, le mot « classement » ;
     pour une course à venir, ce qu'on trouvera en arrivant. */
  const texte = past
    ? `Résultats et classement de ${displayRaceName(race.name)}, ${discipline} du ${dayInWords(race.raceDate)} à ${placeWords(race)}. Épreuve ${federation}.${cats}${distance} Coureurs classés et parcours.`
    : `${displayRaceName(race.name)}, ${discipline} le ${dayInWords(race.raceDate)} à ${placeWords(race)}. Épreuve ${federation}.${cats}${distance} Parcours, météo au départ, engagés et résultats des éditions précédentes.`;
  return couper(texte, 300);
}

/** Coupe à un mot entier : une phrase tranchée au milieu d'un mot fait bâclé. */
function couper(texte: string, max: number): string {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).replace(/[\s,;:·-]+$/, "")}…`;
}

/**
 * La fiche dans le vocabulaire des moteurs.
 *
 * `SportsEvent` est ce que Google attend d'une course : un lieu, une date, un
 * organisateur. Sans ça, la page n'est qu'un texte parmi d'autres ; avec, elle
 * peut paraître comme un événement, avec sa date, dans les résultats.
 */
export function raceJsonLd(race: Race): Record<string, unknown> {
  const place: Record<string, unknown> = {
    "@type": "Place",
    name: placeWords(race),
    address: {
      "@type": "PostalAddress",
      addressLocality: race.city,
      postalCode: race.postcode ?? undefined,
      addressRegion: race.departmentName ?? undefined,
      addressCountry: "FR",
    },
  };
  if (race.lat != null && race.lng != null) {
    place.geo = { "@type": "GeoCoordinates", latitude: race.lat, longitude: race.lng };
  }
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: displayRaceName(race.name),
    sport: "Cyclisme",
    startDate: race.raceDate,
    endDate: race.raceDateEnd ?? race.raceDate,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: race.isCancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    url: `${CANONICAL_SITE_URL}/course/${race.id}`,
    location: place,
    organizer: race.organizer
      ? { "@type": "Organization", name: race.organizer }
      : { "@type": "Organization", name: FEDERATIONS.find((f) => f.slug === race.federationSlug)?.fullName ?? "PelotonFR" },
    description: raceDescription(race),
  };
}
