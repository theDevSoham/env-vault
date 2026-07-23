"use client";

import { useState } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

/** Read-only value with a copy button — for one-time secrets & fingerprints. */
export function CopyField({
  value,
  multiline,
  className,
}: {
  value: string;
  multiline?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select manually */
    }
  }

  return (
    <div className={cn("flex gap-2", multiline ? "items-start" : "items-center", className)}>
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={3}
          onFocus={(event) => event.target.select()}
          className="w-full rounded-sm border border-border bg-surface-0 p-2 font-mono text-xs text-text"
        />
      ) : (
        <input
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
          className="w-full rounded-sm border border-border bg-surface-0 px-2.5 py-1.5 font-mono text-xs text-text"
        />
      )}
      <Button size="sm" variant="secondary" onClick={copy} className="shrink-0">
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
