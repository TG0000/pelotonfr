"use client";
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="mx-auto max-w-2xl px-4 py-16"><h1 className="font-heading text-3xl font-bold">Cette page ne peut pas être chargée</h1><p className="my-4 text-muted-foreground">Les données sont temporairement indisponibles. Réessaie dans un instant.</p><button onClick={reset} className="rounded-full border px-5 py-3">Réessayer</button></section>;
}
