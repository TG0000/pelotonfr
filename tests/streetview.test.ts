import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPano, coverageFromSamples } from "../lib/streetview-metadata";
import { loadMaps } from "../lib/google-maps-loader";

test("Google loader shares an in-flight request and retries after a network failure", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  type Script = { onerror: (() => void) | null; onload: (() => void) | null; removed: boolean; remove: () => void };
  const scripts: Script[] = [];
  const fakeWindow: { google?: { maps: { importLibrary: () => Promise<object> } }; __pelotonMaps?: unknown } = {};
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ onerror: null, onload: null, removed: false, remove() { this.removed = true; } }),
    head: { appendChild: (script: Script) => scripts.push(script) },
  } });
  try {
    const first = loadMaps("test-key");
    assert.equal(loadMaps("test-key"), first);
    assert.equal(scripts.length, 1);
    const rejected = assert.rejects(first, /n’a pas chargé/);
    scripts[0].onerror!();
    await rejected;
    assert.equal(scripts[0].removed, true);
    assert.equal(fakeWindow.__pelotonMaps, undefined);
    const retry = loadMaps("test-key");
    assert.equal(scripts.length, 2);
    fakeWindow.google = { maps: { importLibrary: async () => ({}) } };
    scripts[1].onload!();
    assert.equal(await retry, fakeWindow.google.maps);
    assert.equal(await loadMaps("test-key"), fakeWindow.google.maps);
    assert.equal(scripts.length, 2);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});

test("Street View distinguishes a provider outage from a confirmed absence, then recovers", async () => {
  const previousFetch = globalThis.fetch;
  try {
    for (const response of [new Response("{}", { status: 503 }), new Response('{"status":"REQUEST_DENIED"}'), new Response("not-json")]) {
      globalThis.fetch = async () => response;
      assert.equal(await hasPano("test-key", 49, 0), null);
    }
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal(await hasPano("test-key", 49, 0), null);
    globalThis.fetch = async () => new Response('{"status":"ZERO_RESULTS"}');
    assert.equal(await hasPano("test-key", 49, 0), false);
    globalThis.fetch = async () => new Response('{"status":"OK"}');
    assert.equal(await hasPano("test-key", 49, 0), true);
  } finally { globalThis.fetch = previousFetch; }
});

test("Incomplete Street View samples cannot replace coverage with a cached zero", () => {
  assert.equal(coverageFromSamples([], 120, 240), null);
  assert.equal(coverageFromSamples([{ m: 0, ok: true }, { m: 120, ok: null }], 120, 240), null);
  assert.deepEqual(coverageFromSamples([{ m: 0, ok: false }, { m: 120, ok: false }], 120, 240), { spans: [], covered: 0 });
  assert.deepEqual(coverageFromSamples([{ m: 0, ok: true }, { m: 120, ok: true }, { m: 240, ok: true }], 120, 240), { spans: [{ fromM: 0, toM: 240 }], covered: 240 });
});
