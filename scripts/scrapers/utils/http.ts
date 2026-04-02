import axios from "axios";
import axiosRetry from "axios-retry";

export const httpClient = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent":
      "PelotonFR/1.0 (+https://pelotonfr.fr; contact@pelotonfr.fr)",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  },
});

axiosRetry(httpClient, {
  retries: 3,
  retryDelay: (retryCount) => axiosRetry.exponentialDelay(retryCount) + Math.random() * 500,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) ||
    (error.response?.status != null && error.response.status >= 500),
});

/** Polite delay between requests (ms) */
export const politeDelay = (ms = 800) =>
  new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 400));
