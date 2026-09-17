import { test } from "node:test";
import assert from "node:assert/strict";
import { sendMail } from "../lib/mail";

test("Missing transport and provider refusal fail; provider acceptance succeeds without exposing its body", async () => {
  const originalFetch = globalThis.fetch;
  const brevo = process.env.BREVO_API_KEY, resend = process.env.RESEND_API_KEY;
  delete process.env.BREVO_API_KEY; delete process.env.RESEND_API_KEY;
  const mail = { to: "recipient@example.test", subject: "Test", text: "<unsafe>&" };
  try {
    await assert.rejects(sendMail(mail), /MAIL_NOT_CONFIGURED/);
    process.env.BREVO_API_KEY = "fake-for-test-only";
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      calls++;
      const body = JSON.parse(String(options?.body));
      assert.match(body.htmlContent, /&lt;unsafe&gt;&amp;/);
      return new Response("provider-secret-must-not-escape", { status: 401 });
    };
    await assert.rejects(sendMail(mail), (error: Error) => error.message === "MAIL_PROVIDER_BREVO_401");
    globalThis.fetch = async () => { calls++; return new Response('{"messageId":"fake"}', { status: 201 }); };
    await sendMail(mail);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (brevo === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = brevo;
    if (resend === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = resend;
  }
});
