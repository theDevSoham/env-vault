import Link from "next/link";
import { Logo } from "@/src/components/Logo";
import { Badge, Button } from "@/src/components/ui";

const FEATURES = [
  { title: "Encrypted before upload", body: "Names and values are encrypted in your browser. The server stores ciphertext it cannot read." },
  { title: "Versioned like Git", body: "Immutable revisions with structural diffs, comparison, and restore — never exposing values." },
  { title: "Share with cryptography", body: "Vault keys are wrapped per member. Removing someone rotates the key for future secrecy." },
  { title: "CLI & CI ready", body: "Pull secrets or inject them into a process with envvault — service accounts for pipelines." },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <Badge tone="accent" className="mb-5">Zero-knowledge · client-side encryption</Badge>
        <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Secrets storage where the server can&apos;t read your secrets.
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-muted">
          Env Vault stores and shares <code className="rounded bg-surface-2 px-1 py-0.5 text-text">.env</code> files
          and secret configuration with end-to-end encryption. The infrastructure holds ciphertext —
          only your devices understand it.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/signup"><Button size="lg">Create an account</Button></Link>
          <Link href="/login"><Button size="lg" variant="secondary">Sign in</Button></Link>
        </div>
        <p className="mt-5 max-w-md text-xs text-faint">
          Your password never leaves this device and derives your keys. Lose it and your data is
          unrecoverable — there is no server-side reset.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 pb-16 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded border border-border bg-surface-1 p-4"
          >
            <h3 className="text-sm font-semibold">{feature.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{feature.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
