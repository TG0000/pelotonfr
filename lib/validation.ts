export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function validSupportMessage(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 10 && value.length <= 5000;
}
export function safeReturnPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  try { return new URL(value, "https://pelotonfr.vercel.app").origin === "https://pelotonfr.vercel.app" ? value : fallback; }
  catch { return fallback; }
}
