import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Env Vault</h1>
      <p className="text-neutral-400">
        Zero-knowledge encrypted storage and sharing for <code>.env</code> secrets and secret
        files. The infrastructure stores secrets — only your devices understand them.
      </p>
      <div className="flex gap-4">
        <Link href="/signup" className="rounded bg-emerald-600 px-5 py-2 font-medium">
          Create account
        </Link>
        <Link href="/login" className="rounded border border-neutral-700 px-5 py-2 font-medium">
          Sign in
        </Link>
      </div>
      <p className="max-w-md text-xs text-neutral-500">
        Your password never leaves this device. Losing it permanently loses access to your
        encrypted data — there is no server-side recovery.
      </p>
    </main>
  );
}
