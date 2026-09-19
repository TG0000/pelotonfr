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

function dayInWords(iso: string): string {
  return format(new Date(`${iso}T12:00:00Z`), "EEEE d MMMM yyyy", { locale: fr });
}

/** « Mantilly (61) », ou le département seul quand la commune manque. */
export function placeWords(race: Race): string {
  const known = race.city && !/préciser/i.test(race.city);
  const code = race.departmentCode ? ` (${race.departmentCode})` : "";
  if (known) return `${race.city}${code}`;
  return race.departmentName ? `${race.departmentName}${code}` : "France";
}

export function raceTitle(race: Race): string {
  const discipline = DISCIPLINE_WORDS[race.discipline] ?? "course cycliste";
  return `${displayRaceName(race.name)} — ${discipline} à ${placeWords(race)}, ${dayInWords(race.raceDate)}`;
}

export function raceDescription(race: Race): string {
  const federation = FEDERATIONS.find((f) => f.slug === race.federationSlug)?.fullName ?? race.federationSlug.toUpperCase();
  const cats = race.categories.length
    ? ` Catégories admises : ${race.categories.slice(0, 6).map(categoryLabel).join(", ")}.`
    : "";
  const distance = race.distanceKm ? ` ${race.distanceKm} km.` : "";
  return `${displayRaceName(race.name)}, ${dayInWords(race.raceDate)} à ${placeWords(race)}. Épreuve ${federation}.${cats}${distance} Parcours, météo au départ, engagés et résultats des éditions précédentes.`.slice(0, 300);
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
