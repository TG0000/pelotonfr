import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportPKCS8, jwtVerify, decodeProtectedHeader } from "jose";
import { appleProvider } from "../lib/apple-auth";

test("Apple stays disabled without complete credentials and signs a verifiable, bounded secret", async () => {
  const keys = ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    keys.forEach(key => delete process.env[key]);
    assert.equal((await appleProvider()).enabled, false);
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    process.env.APPLE_CLIENT_ID = "app.pelotonfr.web.test";
    process.env.APPLE_TEAM_ID = "TEAM123456";
    process.env.APPLE_KEY_ID = "KEY1234567";
    assert.equal((await appleProvider()).enabled, false);
    process.env.APPLE_PRIVATE_KEY = (await exportPKCS8(privateKey)).replace(/\n/g, "\\n");
    const provider = await appleProvider();
    const { payload } = await jwtVerify(provider.clientSecret, publicKey, { issuer: "TEAM123456", audience: "https://appleid.apple.com", subject: "app.pelotonfr.web.test", algorithms: ["ES256"] });
    assert.equal(decodeProtectedHeader(provider.clientSecret).kid, "KEY1234567");
    assert.equal(payload.exp! - payload.iat!, 180 * 86400);
    assert.ok(payload.exp! - payload.iat! < 15777000);
    process.env.APPLE_PRIVATE_KEY = "invalid";
    await assert.rejects(appleProvider());
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
