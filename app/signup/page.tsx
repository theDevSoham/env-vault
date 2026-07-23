"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, humanizeApiError } from "@/src/lib/api/client";
import { signup } from "@/src/lib/client/flows";
import { Logo } from "@/src/components/Logo";
import { Button, Card, Field, Input } from "@/src/components/ui";

interface FieldErrors {
  email?: string;
  password?: string;
  confirm?: string;
  acknowledge?: string;
  form?: string;
  formDetail?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const clear = (key: keyof FieldErrors) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined, form: undefined } : prev));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read from the DOM (not React state) so Google/browser autofill is captured.
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm") ?? "");
    const acknowledged = data.get("acknowledge") != null;

    const next: FieldErrors = {};
    if (!email) next.email = "Enter your email.";
    else if (!EMAIL_RE.test(email)) next.email = "That doesn't look like a valid email address.";
    if (!password) next.password = "Choose a password.";
    else if (password.length < 10) next.password = `Use at least 10 characters (you have ${password.length}).`;
    if (!confirm) next.confirm = "Re-enter your password to confirm.";
    else if (password && confirm !== password) next.confirm = "Passwords don't match.";
    if (!acknowledged) next.acknowledge = "Please acknowledge this before continuing.";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      await signup(email, password);
      router.push("/vaults");
    } catch (error) {
      const { message, detail } = humanizeApiError(error, "signup");
      // Attach a taken email to the email field; everything else to a form banner.
      if (error instanceof ApiClientError && error.code === "email_taken") {
        setErrors({ email: message });
      } else {
        setErrors({ form: message, formDetail: detail });
      }
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex justify-center"><Logo /></Link>
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Create account</h1>
        <div className="mb-5 mt-3 rounded-sm border border-warn/30 bg-warn-soft p-3 text-xs leading-relaxed text-warn">
          Your password derives your encryption keys on this device. If you lose it, your encrypted
          data is <strong>permanently unrecoverable</strong> — Env Vault cannot reset it.
        </div>

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
          <Field label="Password" hint="Minimum 10 characters." error={errors.password}>
            <Input name="password" type="password" autoComplete="new-password" placeholder="••••••••••" onInput={() => clear("password")} />
          </Field>
          <Field label="Confirm password" error={errors.confirm}>
            <Input name="confirm" type="password" autoComplete="new-password" placeholder="••••••••••" onInput={() => clear("confirm")} />
          </Field>
          <div>
            <label className="flex items-start gap-2 text-xs text-muted">
              <input name="acknowledge" type="checkbox" className="mt-0.5 accent-accent" onChange={() => clear("acknowledge")} />
              I understand that losing my password means losing my encrypted data.
            </label>
            {errors.acknowledge && <p className="mt-1 text-xs text-danger">{errors.acknowledge}</p>}
          </div>
          <Button type="submit" size="lg" loading={busy} className="w-full">
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
