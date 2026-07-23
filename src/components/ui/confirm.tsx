"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog, DialogFooter } from "./Dialog";
import { Input } from "./Input";

/**
 * In-app replacement for native confirm()/prompt() (ADR-010) — reliable in
 * embedded/automated contexts and consistent with the design system.
 */
interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, renders a prompt input; resolves to the string (or null if cancelled). */
  prompt?: { label?: string; placeholder?: string; defaultValue?: string; type?: string };
}

type Resolver = (value: string | boolean | null) => void;

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<string | boolean | null>) | null>(
  null
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [value, setValue] = useState("");
  const [resolver, setResolver] = useState<{ fn: Resolver } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setValue(opts.prompt?.defaultValue ?? "");
    return new Promise<string | boolean | null>((resolve) => setResolver({ fn: resolve }));
  }, []);

  const close = (result: string | boolean | null) => {
    resolver?.fn(result);
    setResolver(null);
    setOptions(null);
    setValue("");
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => close(options?.prompt ? null : false)}
        title={options?.title ?? ""}
        description={options?.description}
        size="sm"
      >
        {options?.prompt && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              close(value);
            }}
          >
            {options.prompt.label && (
              <p className="mb-1.5 text-xs font-medium text-muted">{options.prompt.label}</p>
            )}
            <Input
              autoFocus
              type={options.prompt.type ?? "text"}
              value={value}
              placeholder={options.prompt.placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          </form>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(options?.prompt ? null : false)}>
            {options?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={options?.danger ? "danger" : "primary"}
            onClick={() => close(options?.prompt ? value : true)}
          >
            {options?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Returns confirm() and prompt() helpers that render in-app dialogs. */
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used within ConfirmProvider");
  return {
    confirm: (options: Omit<ConfirmOptions, "prompt">) => confirm(options) as Promise<boolean>,
    prompt: (options: ConfirmOptions & { prompt: NonNullable<ConfirmOptions["prompt"]> }) =>
      confirm(options) as Promise<string | null>,
  };
}
