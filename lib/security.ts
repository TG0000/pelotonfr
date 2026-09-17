import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function tokenKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error("Token encryption is not configured");
  return Buffer.from(key, "hex");
}

export function sealToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from("pelotonfr:strava:v1"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function openToken(value: string): string {
  const [version, iv, tag, data, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data || extra) throw new Error("Token requires migration or reconnection");
  const cipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from("pelotonfr:strava:v1"));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8");
}

export function opaqueId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function operatorAllowed(userId: string, allowList = process.env.ADMIN_USER_IDS ?? ""): boolean {
  return allowList.split(",").map((id) => id.trim()).filter(Boolean).includes(userId);
}
