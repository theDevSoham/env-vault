"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "./ui/confirm";
import { ToastProvider } from "./ui/Toast";

/** Client-side app providers (toast + confirm dialogs). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
