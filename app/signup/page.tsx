"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signup } from "@/src/lib/client/flows";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="mx-auto mt-20 w-full max-w-sm p-4">
      <h1 className="mb-2 text-2xl font-bold">Create account</h1>
      <p className="mb-4 rounded border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-300">
        Your password derives your encryption keys on this device. If you lose it, your
        encrypted data is <strong>permanently unrecoverable</strong> — Env Vault cannot reset it
        for you.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (password !== confirm) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await signup(email, password);
            router.push("/vaults");
          } catch (e) {
            setError(e instanceof Error && e.message.includes("email_taken") ? "Email already registered." : "Signup failed.");
            setBusy(false);
          }
        }}
        className="flex flex-col gap-3"
      >
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
        <input type="password" required minLength={10} placeholder="Password (min 10 chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
        <input type="password" required placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
        <label className="flex items-start gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
          I understand that losing my password means losing my encrypted data.
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy || !acknowledged} className="rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50">
          {busy ? "Generating keys…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-neutral-400">
        Already have an account? <Link href="/login" className="text-emerald-400">Sign in</Link>
      </p>
    </main>
  );
}
