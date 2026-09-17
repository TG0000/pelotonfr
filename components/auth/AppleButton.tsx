"use client";
import { OAuthButton } from "./OAuthButton";

/** Only rendered after the server-side Apple provider has been configured. */
export function AppleButton({ callbackURL = "/ma-saison" }: { callbackURL?: string }) {
  return <OAuthButton provider="apple" callbackURL={callbackURL} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-full border border-black bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foreground disabled:opacity-70 dark:border-white dark:bg-white dark:text-black dark:hover:bg-neutral-200">
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c.03 3.24 2.85 4.32 2.88 4.34-.02.07-.45 1.54-1.48 3.05-.89 1.3-1.81 2.6-3.27 2.63-1.44.03-1.9-.85-3.55-.85-1.64 0-2.15.82-3.52.88-1.41.05-2.49-1.4-3.39-2.7-1.84-2.66-3.25-7.52-1.36-10.8a5.25 5.25 0 0 1 4.46-2.7c1.39-.02 2.7.94 3.54.94.85 0 2.43-1.17 4.1-1 .7.03 2.66.28 3.92 2.13-.1.06-2.35 1.37-2.33 4.08ZM14.4 4.58c.75-.91 1.26-2.18 1.12-3.45-1.08.05-2.39.72-3.16 1.63-.69.8-1.3 2.08-1.14 3.31 1.2.09 2.42-.61 3.18-1.49Z" /></svg>
    Continuer avec Apple
  </OAuthButton>;
}
