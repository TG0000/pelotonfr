"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

/** La lettre, modifiable sur place, et un bouton qui dit qu'il a copié. */
export function CopyLetter({ text }: { text: string }) {
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* le navigateur refuse : le texte reste sélectionnable */
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={26}
        className="w-full rounded-xl border border-border bg-surface-1 p-4 font-sans text-sm leading-relaxed"
        aria-label="Texte de la lettre"
      />
      <button type="button" onClick={copy} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start gap-1.5")}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copié" : "Copier la lettre"}
      </button>
    </div>
  );
}
