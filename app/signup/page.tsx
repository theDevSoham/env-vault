"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, humanizeApiError } from "@/src/lib/api/client";
import { signup } from "@/src/lib/client/flows";
import { Logo } from "@/src/components/Logo";
import { Button, Card, Field, Input } from "@/src/components/ui";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignupPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState<{ message: string; detail?: string } | null>(null);

  // Read live values from the DOM so browser/Google autofill is always captured.
  const readForm = useCallback(() => {
    const form = formRef.current;
    if (!form) return null;
    const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null);
    return {
      email: (get("email")?.value ?? "").trim(),
      password: get("password")?.value ?? "",
      confirm: get("confirm")?.value ?? "",
      acknowledged: !!get("acknowledge")?.checked,
    };
  }, []);

  // Recompute whether the form is complete/valid → gates the button.
  const recompute = useCallback(() => {
    const v = readForm();
    if (!v) return;
    setCanSubmit(
      EMAIL_RE.test(v.email) &&
        v.password.length >= 10 &&
        v.confirm === v.password &&
        v.acknowledged
    );
  }, [readForm]);

  // Catch values autofilled before hydration.
  useEffect(() => {
    recompute();
  }, [recompute]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = readForm();
    if (!v || !canSubmit) return;
    setEmailError("");
    setFormError(null);
    setBusy(true);
    try {
      await signup(v.email, v.password);
      router.push("/vaults");
    } catch (error) {
      const humanized = humanizeApiError(error, "signup");
      if (error instanceof ApiClientError && error.code === "email_taken") {
        setEmailError(humanized.message);
      } else {
        setFormError(humanized);
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
          <Field label="Email" error={emailError}>
            <Input name="email" type="email" autoComplete="email" placeholder="you@example.com" onInput={() => setEmailError("")} />
          </Field>
          <Field label="Password" hint="Minimum 10 characters.">
            <Input name="password" type="password" autoComplete="new-password" placeholder="••••••••••" />
          </Field>
          <Field label="Confirm password">
            <Input name="confirm" type="password" autoComplete="new-password" placeholder="••••••••••" />
          </Field>
          <label className="flex items-start gap-2 text-xs text-muted">
            <input name="acknowledge" type="checkbox" className="mt-0.5 accent-accent" onChange={recompute} />
            I understand that losing my password means losing my encrypted data.
          </label>
          <Button type="submit" size="lg" loading={busy} disabled={!canSubmit} className="w-full">
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
