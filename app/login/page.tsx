"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/src/lib/client/flows";
import { Logo } from "@/src/components/Logo";
import { Button, Card, Field, Input } from "@/src/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex justify-center"><Logo /></Link>
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Your keys are derived locally from your password.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              await login(email, password);
              router.push("/vaults");
            } catch {
              setError("Sign-in failed. Check your email and password.");
              setBusy(false);
            }
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Email">
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password" error={error}>
            <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
          </Field>
          <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">
            {busy ? "Deriving keys…" : "Sign in"}
          </Button>
        </form>
      </Card>
      <p className="mt-5 text-center text-sm text-muted">
        New here? <Link href="/signup" className="text-accent hover:underline">Create an account</Link>
      </p>
    </main>
  );
}
