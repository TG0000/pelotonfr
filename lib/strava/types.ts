/** The minimal query surface the matcher needs, so it works in app and scripts. */
export type SqlLike = (
  query: string,
  params?: unknown[]
) => Promise<Record<string, unknown>[]>;
