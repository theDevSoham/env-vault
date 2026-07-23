"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signup } from "@/src/lib/client/flows";
import { Logo } from "@/src/components/Logo";
import { Button, Card, Field, Input } from "@/src/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex justify-center"><Logo /></Link>
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Create account</h1>
        <div className="mb-5 mt-3 rounded-sm border border-warn/30 bg-warn-soft p-3 text-xs leading-relaxed text-warn">
          Your password derives your encryption keys on this device. If you lose it, your encrypted
          data is <strong>permanently unrecoverable</strong> — Env Vault cannot reset it.
        </div>
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
          className="flex flex-col gap-4"
        >
          <Field label="Email">
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password" hint="Minimum 10 characters.">
            <Input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
          </Field>
          <Field label="Confirm password" error={error}>
            <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••••" />
          </Field>
          <label className="flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 accent-accent" />
            I understand that losing my password means losing my encrypted data.
          </label>
          <Button type="submit" size="lg" loading={busy} disabled={!acknowledged} className="w-full">
            {busy ? "Generating keys…" : "Create account"}
          </Button>
        </form>
      </Card>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
      </p>
    </main>
  );
}
