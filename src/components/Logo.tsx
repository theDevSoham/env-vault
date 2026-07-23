import { cn } from "./ui/cn";

/** Wordmark with a small vault-shield glyph. Inline SVG (no external asset). */
export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2 4 5v6c0 4.4 3.1 8.3 8 11 4.9-2.7 8-6.6 8-11V5l-8-3Z"
          stroke="var(--color-accent)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="11" r="2.2" stroke="var(--color-accent)" strokeWidth="1.6" />
        <path d="M12 13.2V16" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {showText && <span className="text-sm font-semibold tracking-tight text-text">Env Vault</span>}
    </span>
  );
}
