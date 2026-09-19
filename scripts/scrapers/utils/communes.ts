/**
 * Les communes de France, et la question qu'elles permettent de trancher :
 * est-ce que cette adresse parle d'un endroit proche de cette course ?
 *
 * La presse régionale publie une liste d'engagés par course, et son adresse
 * mélange la commune au nom de l'épreuve — « tour-de-l-orne-12-et-13-
 * septembre », « st-brieuc-agglo-tour-22-et-23-aout ». Le rattachement se
 * faisait sur la seule ressemblance des mots, sans jamais regarder où c'était :
 * la liste du Tour de l'Orne se voyait proposer le Tour de la Boëme à La
 * Couronne, à quatre cents kilomètres, parce que les deux contiennent
 * « tour ». Sur les trente-cinq candidats que la file d'attente proposait,
 * trente et un étaient de cet ordre — Deauville contre Ézanville, Plaudren
 * contre Châtelaudren, Liège-Bastogne-Liège contre Aubagne.
 *
 * Un nom se trompe ; une distance, non. Le référentiel officiel des communes
 * tient en une requête et quatre mégaoctets, il porte le centre de chacune, et
 * il répond à la seule question qui départage.
 */

export interface Commune {
  nom: string;
  departement: string;
  lat: number;
  lng: number;
}

const API = "https://geo.api.gouv.fr/communes?fields=nom,codeDepartement,centre&format=json";

/** Les mots qui ne terminent pas un nom de commune : « Saint-Fort-sur- » n'est rien. */
const PARTICULES = new Set([
  "sur", "sous", "en", "le", "la", "les", "de", "du", "des", "d", "l", "et",
  "au", "aux", "lez", "les", "sainte", "saint",
]);

export function normaliser(valeur: string): string {
  return valeur
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bst\b/g, "saint")
    .replace(/\bste\b/g, "sainte")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let index: Map<string, Commune[]> | null = null;
let chargement: Promise<Map<string, Commune[]>> | null = null;

function poser(map: Map<string, Commune[]>, cle: string, commune: Commune): void {
  if (!cle) return;
  const liste = map.get(cle);
  if (liste) liste.push(commune);
  else map.set(cle, [commune]);
}

async function construire(): Promise<Map<string, Commune[]>> {
  const map = new Map<string, Commune[]>();
  const res = await fetch(API, {
    headers: { "User-Agent": "PelotonFR/1.0 (+https://pelotonfr.com/contact)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`geo.api.gouv.fr a répondu ${res.status}`);
  const data = (await res.json()) as Array<{
    nom: string;
    codeDepartement: string;
    centre?: { coordinates: [number, number] };
  }>;

  for (const brut of data) {
    const commune: Commune = {
      nom: brut.nom,
      departement: brut.codeDepartement,
      lat: brut.centre?.coordinates[1] ?? 0,
      lng: brut.centre?.coordinates[0] ?? 0,
    };
    const cle = normaliser(brut.nom);
    const mots = cle.split(" ");
    /* La commune est indexée sous son nom entier, mais aussi sous chacun de
       ses débuts : la presse écrit « Segré » pour Segré-en-Anjou Bleu et
       « Équeurdreville » pour Équeurdreville-Hainneville, parce que c'est
       ainsi que le village s'appelait avant la fusion et que tout le monde
       l'appelle encore. Un début qui s'arrête sur une particule ne nomme
       rien, et « saint » tout seul nommerait quatre mille communes. */
    for (let n = 1; n <= mots.length; n++) {
      const debut = mots.slice(0, n);
      if (PARTICULES.has(debut[debut.length - 1])) continue;
      const k = debut.join(" ");
      /* Sept lettres au moins pour un début de nom : « gault », « hauts »,
         « terre » se reconnaissent dans des dizaines de communes sans rapport
         — Le Gault-Saint-Denis contre Quelaines-Saint-Gault, Les Hauts-d'Anjou
         contre Les Hauts-Vents — et une commune citée par erreur suffit à
         faire refuser un bon rattachement. Un nom entier, lui, est indexé
         quelle que soit sa longueur. */
      if (n < mots.length && k.length < 7) continue;
      if (k.length < 4) continue;
      poser(map, k, commune);
      // « L'Aigle » s'écrit « laigle » dans une adresse, « Le Havre » « lehavre ».
      poser(map, k.replace(/\s+/g, ""), commune);
    }
    const sansArticle = cle.replace(/^(l|le|la|les|d) /, "");
    if (sansArticle !== cle && sansArticle.length >= 5) {
      poser(map, sansArticle, commune);
      poser(map, sansArticle.replace(/\s+/g, ""), commune);
    }
  }
  return map;
}

/** Chargé une fois par exécution : une requête, quatre mégaoctets, 35 000 communes. */
export async function chargerCommunes(): Promise<Map<string, Commune[]>> {
  if (index) return index;
  chargement ??= construire().then((m) => {
    index = m;
    return m;
  });
  return chargement;
}

/** Kilomètres entre deux points, assez juste à l'échelle de la France. */
export function kmEntre(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * 111.32;
  const dLng = (b[1] - a[1]) * 111.32 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * Toutes les communes nommées dans un texte, où qu'elles s'y trouvent.
 *
 * Ne lire que le début serait plus simple et plus faux : « grand-prix-de-
 * plouay » commence par « Grand », qui est une commune des Vosges, et
 * « ronde-cycliste-de-laubrieres » par « La Ronde », qui est en
 * Charente-Maritime. On prend tout ce qui nomme une commune, et c'est la plus
 * proche de la course qui tranche.
 */
export function communesCitees(
  texte: string,
  index: Map<string, Commune[]>
): Commune[] {
  const mots = normaliser(texte).split(" ").filter(Boolean);
  const trouvees: Commune[] = [];
  for (let i = 0; i < mots.length; i++) {
    /* Le nom le plus long l'emporte, et on s'arrête là. « La Chapelle-sur-Erdre »
       contient « La Chapelle », qui nomme soixante communes dispersées dans
       toute la France : en gardant les deux, l'adresse finit par nommer un
       endroit près de n'importe quelle course. */
    for (let n = Math.min(5, mots.length - i); n >= 1; n--) {
      const suite = mots.slice(i, i + n);
      const liste =
        index.get(suite.join(" ")) ?? index.get(suite.join(""));
      if (liste) {
        trouvees.push(...liste);
        i += n - 1;
        break;
      }
    }
  }
  return trouvees;
}

export interface Voisinage {
  /** La commune citée la plus proche de la course. */
  commune: Commune;
  km: number;
}

/**
 * La commune citée par l'adresse qui est la plus proche de la course.
 *
 * `null` quand l'adresse ne nomme aucune commune connue — ce qui arrive pour
 * un titre de course pur, « bretagne-classic-cic » ou « liege-bastogne-liege ».
 * Ce cas-là n'est pas un échec de rattachement : c'est une adresse qui ne dit
 * pas où, et la file d'attente doit le dire plutôt que de proposer au hasard.
 */
export function communeLaPlusProche(
  texte: string,
  course: { lat: number | null; lng: number | null },
  index: Map<string, Commune[]>
): Voisinage | null {
  const citees = communesCitees(texte, index);
  if (citees.length === 0 || course.lat === null || course.lng === null) return null;
  let meilleure: Voisinage | null = null;
  for (const commune of citees) {
    const d = kmEntre([course.lat, course.lng], [commune.lat, commune.lng]);
    if (!meilleure || d < meilleure.km) meilleure = { commune, km: d };
  }
  return meilleure;
}
