import { cache } from "react";

/** One server clock snapshot for all cards in this render. */
export const requestTime = cache(() => new Date().getTime());
