import { createHmac } from "node:crypto";

/** Cookie-authenticated writes only come from this exact application origin. */
export function mutationOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

/** Vercel overwrites this header. Outside Vercel, share a conservative budget. */
export function visitorKey(request: Pick<Request, "headers">): string {
  const address = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : "local";
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Request hashing is not configured");
  return createHmac("sha256",secret).update(address || "unknown").digest("hex").slice(0,24);
}

export async function jsonObject(request: Request, maximum = 4096): Promise<Record<string,unknown> | null> {
  if (Number(request.headers.get("content-length"))>maximum) return null;
  const reader=request.body?.getReader(); if(!reader)return null;
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maximum){await reader.cancel();return null;}chunks.push(part.value);}
    const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return body && typeof body==="object" && !Array.isArray(body) ? body : null;
  } catch { return null; } finally {reader.releaseLock();}
}
