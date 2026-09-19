import { CANONICAL_SITE_URL } from "@/lib/site-url";

/**
 * Prévenir les moteurs le soir même, sans attendre qu'ils repassent.
 *
 * Un plan de site dit ce qui existe ; il ne dit pas ce qui vient de changer,
 * et un site neuf est visité rarement. Une course annoncée le mardi pour le
 * dimanche a cinq jours pour être trouvée : si le robot passe le mois
 * prochain, elle aura été courue sans que personne l'ait cherchée ici.
 *
 * IndexNow est le protocole que Bing, Yandex, Seznam et Naver partagent :
 * une clé publiée à la racine du domaine prouve qu'on parle bien pour ce
 * site, et un seul appel les prévient tous. Google n'y participe pas — pour
 * lui, il reste le plan de site et la Search Console.
 *
 * La clé n'est pas un secret : elle est publiée en clair à l'adresse
 * ci-dessous, c'est tout son fonctionnement. La garder dans le dépôt évite
 * qu'un déploiement l'oublie et fasse échouer chaque soumission en silence.
 */
export const INDEXNOW_KEY = "f21b81f8c165eda9bf178eed9daba151";

export function indexNowKeyLocation(): string {
  return `${CANONICAL_SITE_URL}/${INDEXNOW_KEY}.txt`;
}

export interface IndexNowResult {
  submitted: number;
  status: number;
  ok: boolean;
}

/** Au plus 10 000 adresses par envoi, dit le protocole. */
const MAX_PAR_ENVOI = 10_000;

export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult[]> {
  const host = new URL(CANONICAL_SITE_URL).host;
  const uniques = [...new Set(urls)].filter((u) => u.startsWith(CANONICAL_SITE_URL));
  const results: IndexNowResult[] = [];

  for (let i = 0; i < uniques.length; i += MAX_PAR_ENVOI) {
    const lot = uniques.slice(i, i + MAX_PAR_ENVOI);
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: indexNowKeyLocation(), urlList: lot }),
      signal: AbortSignal.timeout(30_000),
    });
    /* 200 et 202 valent tous deux acceptation : le second dit « clé reçue,
       vérification en cours ». Tout le reste est un refus qu'il faut lire. */
    results.push({ submitted: lot.length, status: res.status, ok: res.status === 200 || res.status === 202 });
  }
  return results;
}
