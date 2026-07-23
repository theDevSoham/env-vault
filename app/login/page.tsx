"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { humanizeApiError } from "@/src/lib/api/client";
import { login } from "@/src/lib/client/flows";
import { Logo } from "@/src/components/Logo";
import { Button, Card, Field, Input } from "@/src/components/ui";

interface FieldErrors {
  email?: string;
  password?: string;
  form?: string;
  formDetail?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const clear = (key: keyof FieldErrors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined, form: undefined } : prev));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read from the DOM so browser/Google autofill is captured reliably.
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const next: FieldErrors = {};
    if (!email) next.email = "Enter your email.";
    else if (!EMAIL_RE.test(email)) next.email = "That doesn't look like a valid email address.";
    if (!password) next.password = "Enter your password.";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      await login(email, password);
      router.push("/vaults");
    } catch (error) {
      const { message, detail } = humanizeApiError(error, "login");
      setErrors({ form: message, formDetail: detail });
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex justify-center"><Logo /></Link>
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Your keys are derived locally from your password.</p>

        {errors.form && (
          <div className="mb-4 rounded-sm border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
            {errors.form}
            {errors.formDetail && (
              <span className="mt-1 block font-mono text-[11px] text-danger/70">{errors.formDetail}</span>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Email" error={errors.email}>
            <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" onInput={() => clear("email")} />
          </Field>
          <Field label="Password" error={errors.password}>
            <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••••" onInput={() => clear("password")} />
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
