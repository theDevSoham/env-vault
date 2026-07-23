"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { api, type RevisionMetaDto } from "@/src/lib/api/client";
import { type StructuralDiff } from "@/src/lib/crypto";
import { decryptRevisionDiff, loadVault } from "@/src/lib/client/flows";
import { SecretsEditor } from "@/src/components/SecretsEditor";
import { UnlockGate } from "@/src/components/UnlockGate";

function DiffView({ diff }: { diff: StructuralDiff }) {
  return (
    <span className="text-xs">
      {diff.added.map((name) => (
        <span key={`a-${name}`} className="mr-2 text-emerald-400">+ {name}</span>
      ))}
      {diff.modified.map((name) => (
        <span key={`m-${name}`} className="mr-2 text-amber-400">~ {name}</span>
      ))}
      {diff.renamed.map((rename) => (
        <span key={`r-${rename.from}`} className="mr-2 text-sky-400">
          {rename.from} → {rename.to}
        </span>
      ))}
      {diff.removed.map((name) => (
        <span key={`d-${name}`} className="mr-2 text-red-400">− {name}</span>
      ))}
      {diff.added.length + diff.modified.length + diff.renamed.length + diff.removed.length === 0 && (
        <span className="text-neutral-500">no structural changes</span>
      )}
    </span>
  );
}

function EnvironmentInner({ vaultId, envId }: { vaultId: string; envId: string }) {
  const [envName, setEnvName] = useState("");
  const [head, setHead] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<RevisionMetaDto[]>([]);
  const [diffs, setDiffs] = useState<Record<number, StructuralDiff>>({});

  const reloadHistory = useCallback(async () => {
    const { revisions: list } = await api.listRevisions(vaultId, envId);
    setRevisions(list);
    const decrypted: Record<number, StructuralDiff> = {};
    for (const meta of list.slice(0, 20)) {
      try {
        decrypted[meta.number] = await decryptRevisionDiff(vaultId, envId, meta);
      } catch {
        /* older generations may be unavailable to new members */
      }
    }
    setDiffs(decrypted);
  }, [vaultId, envId]);

  useEffect(() => {
    void (async () => {
      const vault = await loadVault(vaultId);
      const environment = vault.environments.find((e) => e.id === envId);
      if (environment) {
        setEnvName(environment.name);
        setHead(environment.headRevision);
      }
      await reloadHistory();
    })();
  }, [vaultId, envId, reloadHistory]);

  if (head === null) return <p className="p-8 text-neutral-400">Decrypting environment…</p>;

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <header className="mb-6">
        <Link href={`/vaults/${vaultId}`} className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Vault
        </Link>
        <h1 className="text-2xl font-bold">{envName}</h1>
      </header>

      <SecretsEditor
        vaultId={vaultId}
        envId={envId}
        headRevision={head}
        onCommitted={() => void reloadHistory()}
      />

      <section className="mt-6 rounded border border-neutral-800 p-4">
        <h2 className="mb-3 font-semibold">History</h2>
        {revisions.length === 0 ? (
          <p className="text-sm text-neutral-500">No revisions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {revisions.map((revision) => (
              <li key={revision.id} className="rounded border border-neutral-900 bg-neutral-900/50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Revision {revision.number}</span>
                  <span className="text-xs text-neutral-500">
                    {new Date(revision.createdAt).toLocaleString()} · gen {revision.keyGeneration}
                  </span>
                </div>
                {revision.message && <p className="text-xs text-neutral-400">{revision.message}</p>}
                {diffs[revision.number] && <DiffView diff={diffs[revision.number]} />}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-neutral-600">
          Values are never shown in history — only which keys changed. Comparison &amp; restore
          arrive with the version-control phase.
        </p>
      </section>
    </main>
  );
}

export default function EnvironmentPage({
  params,
}: {
  params: Promise<{ vaultId: string; envId: string }>;
}) {
  const { vaultId, envId } = use(params);
  return (
    <UnlockGate>
      <EnvironmentInner vaultId={vaultId} envId={envId} />
    </UnlockGate>
  );
}
