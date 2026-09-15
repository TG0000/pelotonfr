"use server";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { consumeLimit } from "@/lib/rate-limit";
import { isUuid, validSupportMessage } from "@/lib/validation";

export async function submitContact(category: string, message: string) {
  if (!["support", "confidentialite", "club"].includes(category) || !validSupportMessage(message)) {
    return { error: "Choisis un sujet et écris un message de 10 à 5 000 caractères." };
  }
  if (!(await consumeLimit("contact:create:global", 20, 60))) {
    return { error: "Trop de demandes à cet instant. Réessaie dans une minute." };
  }
  const code = randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(code).digest("hex");
  const [row] = await sql(`INSERT INTO support_requests(access_hash,category,message)
    VALUES ($1,$2,$3) RETURNING id`, [hash, category, message.trim()]);
  return { id: String(row.id), code };
}
export async function readContact(id: string, code: string) {
  if (!isUuid(id) || !/^[\w-]{32}$/.test(code)) return { error: "Référence ou code incorrect." };
  if (!(await consumeLimit("contact:read:global", 120, 60))) return { error: "Réessaie dans une minute." };
  const hash = createHash("sha256").update(code).digest("hex");
  const [row] = await sql(`SELECT category,message,reply,status,created_at FROM support_requests
    WHERE id=$1::uuid AND access_hash=$2`, [id, hash]);
  if (!row) return { error: "Référence ou code incorrect." };
  return { ticket: { message: String(row.message), reply: row.reply ? String(row.reply) : null, status: String(row.status) } };
}
