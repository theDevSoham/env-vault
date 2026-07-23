"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-accent/40 bg-surface-2",
  error: "border-danger/50 bg-surface-2",
  info: "border-border-strong bg-surface-2",
};
const TONE_DOT: Record<ToastTone, string> = {
  success: "bg-accent",
  error: "bg-danger",
  info: "bg-info",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded border px-3.5 py-3 text-sm text-text shadow-pop animate-pop-in",
              TONE_STYLES[toast.tone]
            )}
          >
            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TONE_DOT[toast.tone])} />
            <span className="leading-snug">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used within ToastProvider");
  return push;
}
