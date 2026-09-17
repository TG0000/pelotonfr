export const CONSENT_COOKIE = "pelotonfr.consent";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;
export function analyticsAllowed(value: string | undefined | null): boolean {
  return value === "v1.accept";
}
