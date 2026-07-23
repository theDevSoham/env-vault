/** Tiny className joiner — zero deps (ADR-010). Falsy values dropped. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
