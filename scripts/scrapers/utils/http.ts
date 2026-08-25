import axios from "axios";
import axiosRetry from "axios-retry";

export const httpClient = axios.create({
  timeout: 25000,
  headers: {
    "User-Agent":
      "PelotonFR/2.0 (+https://pelotonfr.fr; contact@pelotonfr.fr)",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  },
});

axiosRetry(httpClient, {
  retries: 3,
  retryDelay: (retryCount) =>
    axiosRetry.exponentialDelay(retryCount) + Math.random() * 500,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    (error.response?.status != null && error.response.status >= 500),
});

/**
 * Fetches a page and decodes it correctly, regardless of what the server claims.
 *
 * cyclisme-amateur.com serves `charset=iso-8859-1` but its bytes are actually
 * UTF-8, so trusting the header turns "GENÉTOUZE" into "GENÃ©TOUZE". Decoding
 * as UTF-8 in strict mode detects the mismatch: real UTF-8 succeeds, genuine
 * Latin-1 raises, and only then do we fall back.
 */
export async function fetchHtml(url: string): Promise<string> {
  const { data } = await httpClient.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
  });
  const bytes = new Uint8Array(data);

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // windows-1252 rather than iso-8859-1: it is a superset covering the
    // curly quotes and dashes French pages routinely contain.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Polite delay between requests (ms) */
export const politeDelay = (ms = 800) =>
  new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 400));
