"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { humanizeApiError } from "@/src/lib/api/client";
import { login } from "@/src/lib/client/flows";
import { Logo } from "@/src/components/Logo";
import { Button, Card, Field, Input } from "@/src/components/ui";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function LoginPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<{ message: string; detail?: string } | null>(null);

  const readForm = useCallback(() => {
    const form = formRef.current;
    if (!form) return null;
    const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null);
    return {
      email: (get("email")?.value ?? "").trim(),
      password: get("password")?.value ?? "",
    };
  }, []);

  const recompute = useCallback(() => {
    const v = readForm();
    if (!v) return;
    setCanSubmit(EMAIL_RE.test(v.email) && v.password.length > 0);
  }, [readForm]);

  useEffect(() => {
    recompute();
  }, [recompute]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = readForm();
    if (!v || !canSubmit) return;
    setFormError(null);
    setBusy(true);
    try {
      await login(v.email, v.password);
      router.push("/vaults");
    } catch (error) {
      setFormError(humanizeApiError(error, "login"));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex justify-center"><Logo /></Link>
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mb-5 mt-1 text-sm text-muted">Your keys are derived locally from your password.</p>

        {formError && (
          <div className="mb-4 rounded-sm border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
            {formError.message}
            {formError.detail && (
              <span className="mt-1 block font-mono text-[11px] text-danger/70">{formError.detail}</span>
            )}
          </div>
        )}

        <form
          ref={formRef}
          onSubmit={onSubmit}
          onInput={recompute}
          onChange={recompute}
          onAnimationStart={(e) => {
            if (e.animationName === "ev-autofill") recompute();
          }}
          noValidate
          method="post"
          className="flex flex-col gap-4"
        >
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••••" />
          </Field>
          <Button type="submit" size="lg" loading={busy} disabled={!canSubmit} className="mt-1 w-full">
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
