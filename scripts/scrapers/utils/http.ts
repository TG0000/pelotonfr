/**
 * Le client HTTP des collecteurs.
 *
 * Écrit sur `fetch`, qui est natif depuis Node 18. Axios était la seule
 * dépendance de production que le site n'exécute jamais — il ne servait qu'aux
 * scripts, pour un timeout, quelques en-têtes et trois tentatives. Cinquante
 * lignes contre un paquet.
 */

const USER_AGENT =
  "PelotonFR/2.0 (+https://pelotonfr.fr; contact@pelotonfr.fr)";

const HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

const TIMEOUT_MS = 25_000;
const RETRIES = 3;

/**
 * Une tentative, puis trois autres en s'écartant.
 *
 * On ne réessaie que ce qui a des chances de marcher à la seconde : une panne
 * réseau, un 429, un 5xx. Un 404 réessayé trois fois est trois fois un 404, et
 * pendant ce temps la source attend.
 */
async function request(url: string): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = 2 ** attempt * 300 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, wait));
    }

    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`${url} → ${res.status}`);
      }
      lastError = new Error(`${url} → ${res.status}`);
    } catch (err) {
      // Une erreur définitive ne se réessaie pas.
      if (err instanceof Error && /→ [1-4]\d\d$/.test(err.message)) throw err;
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${url} injoignable`);
}

/** Le corps en texte, décodé comme ci-dessous. */
export async function fetchText(url: string): Promise<string> {
  return decode(await (await request(url)).arrayBuffer());
}

/**
 * Fetches a page and decodes it correctly, regardless of what the server claims.
 *
 * cyclisme-amateur.com serves `charset=iso-8859-1` but its bytes are actually
 * UTF-8, so trusting the header turns "GENÉTOUZE" into "GENÃ©TOUZE". Decoding
 * as UTF-8 in strict mode detects the mismatch: real UTF-8 succeeds, genuine
 * Latin-1 raises, and only then do we fall back.
 */
function decode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // windows-1252 rather than iso-8859-1: it is a superset covering the
    // curly quotes and dashes French pages routinely contain.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function fetchHtml(url: string): Promise<string> {
  return fetchText(url);
}

/** Polite delay between requests (ms) */
export const politeDelay = (ms = 800) =>
  new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 400));
