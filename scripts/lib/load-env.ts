/**
 * Loads environment variables for standalone scripts.
 *
 * Next.js reads `.env.local` automatically, but scripts run under tsx do not,
 * so every script goes through this helper. Files are read in Next.js
 * precedence order and an already-set variable is never overwritten — that way
 * CI (GitHub Actions secrets) and Vercel always win over a local file.
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const FILES = [".env.local", ".env.development.local", ".env"];

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  for (const file of FILES) {
    const path = join(ROOT, file);
    if (existsSync(path)) {
      loadDotenv({ path, override: false, quiet: true });
    }
  }
}

/** Reads a required variable, failing loudly rather than half-running. */
export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing required environment variable ${name}.\n` +
        `Add it to .env.local (local) or to the repository secrets (CI).`
    );
    process.exit(1);
  }
  return value;
}

/** True when a .env file actually exists — useful for clearer error messages. */
export function hasLocalEnvFile(): boolean {
  return FILES.some((f) => existsSync(join(ROOT, f)));
}
