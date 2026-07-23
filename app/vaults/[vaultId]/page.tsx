"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { api } from "@/src/lib/api/client";
import { createEnvironment, loadVault, type DecryptedVault } from "@/src/lib/client/flows";
import { FilesPanel } from "@/src/components/FilesPanel";
import { MembersPanel } from "@/src/components/MembersPanel";
import { ServiceAccountsPanel } from "@/src/components/ServiceAccountsPanel";
import { UnlockGate } from "@/src/components/UnlockGate";

function VaultInner({ vaultId }: { vaultId: string }) {
  const router = useRouter();
  const [vault, setVault] = useState<DecryptedVault | null>(null);
  const [newEnvName, setNewEnvName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setVault(await loadVault(vaultId));
  }, [vaultId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!vault) return <p className="p-8 text-neutral-400">Decrypting vault…</p>;
  const isOwner = vault.detail.role === "owner";

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/vaults" className="text-sm text-neutral-500 hover:text-neutral-300">
            ← Vaults
          </Link>
          <h1 className="text-2xl font-bold">{vault.name}</h1>
          <p className="text-xs text-neutral-500">
            key generation {vault.detail.vault.keyGeneration} · your role: {vault.detail.role}
          </p>
        </div>
        {isOwner && (
          <button
            onClick={async () => {
              if (!confirm(`Delete vault "${vault.name}" and everything in it? This cannot be undone.`)) return;
              await api.deleteVault(vaultId);
              router.replace("/vaults");
            }}
            className="rounded border border-red-800 px-3 py-1 text-sm text-red-400"
          >
            Delete vault
          </button>
        )}
      </header>

      <section className="mb-6 rounded border border-neutral-800 p-4">
        <h2 className="mb-3 font-semibold">Environments</h2>
        {vault.environments.length === 0 && (
          <p className="mb-2 text-sm text-neutral-500">
            No environments yet{isOwner ? " — create Development / Staging / Production below." : "."}
          </p>
        )}
        <ul className="mb-3 flex flex-col gap-2">
          {vault.environments.map((environment) => (
            <li key={environment.id}>
              <Link
                href={`/vaults/${vaultId}/env/${environment.id}`}
                className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-4 py-2 hover:border-neutral-600"
              >
                <span>{environment.name}</span>
                <span className="text-xs text-neutral-500">rev {environment.headRevision}</span>
              </Link>
            </li>
          ))}
        </ul>
        {isOwner && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                await createEnvironment(vaultId, newEnvName);
                setNewEnvName("");
                await reload();
              } finally {
                setBusy(false);
              }
            }}
            className="flex gap-2"
          >
            <input
              required
              placeholder="Environment name (e.g. Development)"
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
            />
            <button disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-sm disabled:opacity-50">
              Add
            </button>
          </form>
        )}
      </section>

      <div className="flex flex-col gap-6">
        <MembersPanel vaultId={vaultId} isOwner={isOwner} />
        {isOwner && <ServiceAccountsPanel vaultId={vaultId} />}
        <FilesPanel vaultId={vaultId} isOwner={isOwner} />
      </div>
    </main>
  );
}

export default function VaultPage({ params }: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = use(params);
  return (
    <UnlockGate>
      <VaultInner vaultId={vaultId} />
    </UnlockGate>
  );
}
