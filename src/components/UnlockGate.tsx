"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resumeSession, unlock } from "../lib/client/flows";
import { Logo } from "./Logo";
import { useSession } from "./useSession";
import { Button, Card, Field, Input, Spinner } from "./ui";

/**
 * Wraps authenticated pages: ensures a session exists (else → /login) and that
 * the private key is unlocked in memory (else password prompt — keys never
 * survive a reload by design, handoff §26).
 */
export function UnlockGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const [resumeFailed, setResumeFailed] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session.userId) return;
    let cancelled = false;
    resumeSession().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        setResumeFailed(true);
        router.replace("/login");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session.userId, router]);

  if (!session.userId) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted">
        <Spinner className="size-4" /> {resumeFailed ? "Redirecting…" : "Loading…"}
      </div>
    );
  }
  if (session.unlocked) return <>{children}</>;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 flex justify-center"><Logo /></div>
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Unlock your vaults</h1>
        <p className="mb-5 mt-1 text-sm text-muted">
          Keys live only in memory and were cleared on reload. Enter your password to decrypt them
          again.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              await unlock(password);
              setPassword("");
            } catch {
              setError("Wrong password.");
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Password" error={error}>
            <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
          </Field>
          <Button type="submit" size="lg" loading={busy} disabled={password.length === 0} className="w-full">
            {busy ? "Deriving key…" : "Unlock"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
