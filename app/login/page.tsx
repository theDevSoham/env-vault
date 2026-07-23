"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/src/lib/client/flows";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <main className="mx-auto mt-20 w-full max-w-sm p-4">
      <h1 className="mb-4 text-2xl font-bold">Sign in</h1>
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
        className="flex flex-col gap-3"
      >
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
        <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy} className="rounded bg-emerald-600 px-3 py-2 font-medium disabled:opacity-50">
          {busy ? "Deriving keys…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-neutral-400">
        New here? <Link href="/signup" className="text-emerald-400">Create an account</Link>
      </p>
    </main>
  );
}
