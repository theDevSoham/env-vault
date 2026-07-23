"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resumeSession, unlock } from "../lib/client/flows";
import { useSession } from "./useSession";

/**
 * Wraps authenticated pages. Ensures a session exists (else → /login) and that
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
    return <p className="p-8 text-neutral-400">{resumeFailed ? "Redirecting…" : "Loading…"}</p>;
  }
  if (session.unlocked) return <>{children}</>;

  return (
    <div className="mx-auto mt-24 w-full max-w-sm rounded-lg border border-neutral-800 p-6">
      <h2 className="mb-1 text-lg font-semibold">Unlock your vaults</h2>
      <p className="mb-4 text-sm text-neutral-400">
        Keys live only in memory and were cleared. Enter your password to decrypt them again.
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
      >
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-3 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          placeholder="Password"
          autoFocus
        />
        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
        <button
          disabled={busy || password.length === 0}
          className="w-full rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50"
        >
          {busy ? "Deriving key…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
