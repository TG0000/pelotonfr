import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sealToken, openToken, operatorAllowed } from "../lib/security";
import { safeReturnPath, isUuid, validSupportMessage } from "../lib/validation";
import { databaseConnectionString } from "../lib/db/transaction";

test("Strava ciphertext is random and authenticated; plaintext and changed keys fail closed", () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const first = sealToken("test-only-token"), second = sealToken("test-only-token");
  assert.notEqual(first, second);
  assert.equal(openToken(first), "test-only-token");
  assert.throws(() => openToken("plaintext-legacy-token"));
  const parts = first.split("."); parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => openToken(parts.join(".")));
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  assert.throws(() => openToken(first));
  delete process.env.TOKEN_ENCRYPTION_KEY;
  assert.throws(() => sealToken("fail-closed"));
});
test("Operator authorization only accepts an explicit complete account ID", () => {
  assert.equal(operatorAllowed("operator-123", " operator-123,other "), true);
  assert.equal(operatorAllowed("operator", "operator-123"), false);
  assert.equal(operatorAllowed("", ""), false);
  assert.equal(operatorAllowed("attacker", "operator-123"), false);
});
test("Remote PostgreSQL connections always verify the certificate", () => {
  const url = new URL(databaseConnectionString("postgres://fake:fake@db.example/test?sslmode=require&uselibpqcompat=true")!);
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
  assert.equal(url.searchParams.has("uselibpqcompat"), false);
});
test("Return destinations reject external hosts, protocol-relative paths and backslashes", () => {
  for (const input of ["https://evil.example", "//evil.example", "/\\evil.example", "/\n/evil.example"]) assert.equal(safeReturnPath(input), "/");
  assert.equal(safeReturnPath("/calendrier?intent=programmee"), "/calendrier?intent=programmee");
});
test("User-supplied IDs and support messages are bounded", () => {
  assert.equal(isUuid("anything"), false);
  assert.equal(isUuid("4d7f5b77-ff60-4f85-af97-cd2c04b0890a"), true);
  assert.equal(validSupportMessage("          "), false);
  assert.equal(validSupportMessage("a".repeat(5001)), false);
  assert.equal(validSupportMessage("Une demande de test."), true);
});
