"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CONSENT_COOKIE, CONSENT_MAX_AGE } from "@/lib/consent";
const CHANGE = "pelotonfr:consent";
const OPEN = "pelotonfr:consent-open";
function readChoice() {
  return document.cookie.split("; ").find(value => value.startsWith(`${CONSENT_COOKIE}=`))?.split("=")[1] ?? null;
}
function subscribe(callback: () => void) {
  window.addEventListener(CHANGE, callback);
  return () => window.removeEventListener(CHANGE, callback);
}
export function useCookieConsent() { return useSyncExternalStore(subscribe, readChoice, () => null); }
export function CookiePreferencesButton() {
  return <button type="button" className="underline underline-offset-4" onClick={() => window.dispatchEvent(new Event(OPEN))}>Gérer mes cookies</button>;
}
export function CookieConsent() {
  const choice = useCookieConsent();
  const [editing, setEditing] = useState(false);
  useEffect(() => { const open = () => setEditing(true); window.addEventListener(OPEN, open); return () => window.removeEventListener(OPEN, open); }, []);
  function choose(accept: boolean) {
    document.cookie = `${CONSENT_COOKIE}=v1.${accept ? "accept" : "reject"}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    window.dispatchEvent(new Event(CHANGE));
    setEditing(false);
  }
  if ((choice === "v1.accept" || choice === "v1.reject") && !editing) return null;
  return <aside aria-label="Choix des cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border bg-background p-5 shadow-xl sm:inset-x-6">
    <h2 className="font-heading text-xl font-bold">Tes choix, simplement.</h2>
    <p className="mt-2 text-sm leading-relaxed">Les cookies nécessaires font fonctionner la connexion et tes préférences. Avec ton accord, PelotonFR mesure aussi les pages consultées et une localisation approximative pour améliorer le site. Aucun suivi publicitaire.</p>
    <Link href="/confidentialite#cookies" className="mt-2 inline-block text-sm underline">Comprendre les cookies et les données</Link>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <button type="button" onClick={() => choose(false)} className="min-h-11 rounded-full border border-primary px-4 py-2 font-semibold">Refuser</button>
      <button type="button" onClick={() => choose(true)} className="min-h-11 rounded-full border border-primary px-4 py-2 font-semibold">Accepter</button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Tu peux changer d’avis dans « Gérer mes cookies », en bas de page.</p>
  </aside>;
}
