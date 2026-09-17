import { cn } from "@/lib/utils";

/** The same route-shaped P in the public site and the premium workspace. */
export function Logo({ className, tile = true }: { className?: string; tile?: boolean }) {
  return <svg viewBox="0 0 52 48" className={cn("size-8", className)} role="img" aria-label="PelotonFR">
    {tile && <rect width="52" height="48" rx="10" fill="var(--brand)" />}
    <g transform={tile ? "translate(4 3) scale(.86)" : undefined}>
      <path d="M8 34 20 10h16c13 0 13 19 0 19H19" fill="none" stroke={tile ? "var(--brand-foreground)" : "currentColor"} strokeWidth="7" strokeLinecap="square" />
      <path d="m22 37 7-14" stroke="var(--highlight)" strokeWidth="7" />
    </g>
  </svg>;
}
export function Wordmark({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center gap-2", className)}>
    <Logo className="size-9 shrink-0" tile={false} />
    <span className="font-sans text-xl font-extrabold tracking-tighter">pelotonfr</span>
  </span>;
}
