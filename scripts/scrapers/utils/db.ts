/**
 * Database access for scripts.
 *
 * The app uses `lib/db` (which reads DATABASE_URL lazily at query time);
 * scripts need an explicit connection they can pass around, so they build one
 * here and thread it through the pipeline rather than reaching for a global.
 */

import { neon } from "@neondatabase/serverless";

export type SqlFn = (
  query: string,
  params?: unknown[]
) => Promise<Record<string, unknown>[]>;

/**
 * Une coupure passagère de la base ne doit pas coûter une nuit de collecte.
 *
 * Neon suspend, réveille et déplace ses instances ; pendant quelques secondes
 * les requêtes partent en « Couldn't connect to compute node », et le serveur
 * marque lui-même ces erreurs `neon:retryable`. Le collecteur de catégories
 * est tombé là-dessus cette nuit après cent trente-huit secondes de travail :
 * huit cent quarante et une courses examinées, rien de gardé, et une page
 * d'état qui annonce un échec pour une base qui allait très bien trente
 * secondes plus tard.
 *
 * On ne réessaie que ce que le serveur dit réessayable, et que les lectures et
 * écritures idempotentes que ces scripts font — un `INSERT ... ON CONFLICT`,
 * un `UPDATE ... WHERE`. Aucune transaction multi-requêtes ne passe par ici :
 * les migrations ont leur propre client.
 */
const TENTATIVES = 4;
const ATTENTE_MS = [400, 1_200, 3_000];

/** Exportée pour être éprouvée : se tromper d'un côté fait boucler sur une
    faute de syntaxe, de l'autre perdre une nuit de collecte. */
export function estReessayable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  if (e["neon:retryable"] === true) return true;
  const message = typeof e.message === "string" ? e.message : "";
  return (
    /couldn't connect to compute node/i.test(message) ||
    /connection terminated|connection closed|socket hang up|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message)
  );
}

export function createSql(databaseUrl: string): SqlFn {
  const client = neon(databaseUrl);
  return async (query, params) => {
    let derniere: unknown;
    for (let essai = 0; essai < TENTATIVES; essai++) {
      try {
        return (await client.query(query, params ?? [])) as Record<string, unknown>[];
      } catch (err) {
        derniere = err;
        if (!estReessayable(err) || essai === TENTATIVES - 1) throw err;
        const attente = ATTENTE_MS[Math.min(essai, ATTENTE_MS.length - 1)];
        console.warn(
          `  base indisponible (${err instanceof Error ? err.message.slice(0, 60) : "?"}), ` +
            `nouvelle tentative dans ${attente} ms`
        );
        await new Promise((r) => setTimeout(r, attente));
      }
    }
    throw derniere;
  };
}
