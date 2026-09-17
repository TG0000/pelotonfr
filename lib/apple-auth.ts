import { importPKCS8, SignJWT } from "jose";

/** No static six-month secret to rotate: sign a fresh JWT on server initialization. */
export async function appleProvider() {
  const clientId = process.env.APPLE_CLIENT_ID?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!clientId || !teamId || !keyId || !privateKey) return { enabled: false, clientId: "", clientSecret: "" };
  const key = await importPKCS8(privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const clientSecret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId).setSubject(clientId).setAudience("https://appleid.apple.com")
    .setIssuedAt(now).setExpirationTime(now + 180 * 24 * 60 * 60).sign(key);
  return { clientId, clientSecret };
}
