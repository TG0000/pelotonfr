/** Enable only after documenting permission for collective/public use of Strava-derived data. */
export function publicStravaEnabled(): boolean {
  return process.env.ENABLE_PUBLIC_STRAVA === "true";
}
