import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "accent" | "danger" | "warn" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-accent-soft text-accent border-accent/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  info: "bg-info-soft text-info border-info/25",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  mono,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        mono && "font-mono tracking-tight",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
