"use client";

import { use, useCallback, useEffect, useState } from "react";
import { api, type RevisionMetaDto } from "@/src/lib/api/client";
import { type StructuralDiff } from "@/src/lib/crypto";
import {
  compareRevisions,
  decryptRevisionDiff,
  exportEnvironment,
  loadVault,
  restoreRevision,
} from "@/src/lib/client/flows";
import { AppShell, PageHeader } from "@/src/components/AppShell";
import { SecretsEditor } from "@/src/components/SecretsEditor";
import { UnlockGate } from "@/src/components/UnlockGate";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  useConfirm,
  useToast,
} from "@/src/components/ui";

function DiffView({ diff }: { diff: StructuralDiff }) {
  const total = diff.added.length + diff.modified.length + diff.renamed.length + diff.removed.length;
  if (total === 0) return <span className="text-xs text-faint">no structural changes</span>;
  return (
    <span className="flex flex-wrap gap-1.5 text-xs">
      {diff.added.map((n) => <Badge key={`a-${n}`} tone="accent" mono>+ {n}</Badge>)}
      {diff.modified.map((n) => <Badge key={`m-${n}`} tone="warn" mono>~ {n}</Badge>)}
      {diff.renamed.map((r) => <Badge key={`r-${r.from}`} tone="info" mono>{r.from} → {r.to}</Badge>)}
      {diff.removed.map((n) => <Badge key={`d-${n}`} tone="danger" mono>− {n}</Badge>)}
    </span>
  );
}

function EnvironmentInner({ vaultId, envId }: { vaultId: string; envId: string }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [envName, setEnvName] = useState("");
  const [head, setHead] = useState<number | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [revisions, setRevisions] = useState<RevisionMetaDto[]>([]);
  const [diffs, setDiffs] = useState<Record<number, StructuralDiff>>({});
  const [compareFrom, setCompareFrom] = useState(0);
  const [compareTo, setCompareTo] = useState(0);
  const [compareResult, setCompareResult] = useState<StructuralDiff | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (head === null) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner className="size-4" /> Decrypting environment…
      </div>
    );
  }

  async function doExport(format: "env" | "json") {
    if (head === null || head === 0) return;
    setBusy(true);
    try {
      const content = await exportEnvironment(vaultId, envId, head, format);
      const safeName = (envName || "environment").toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "env" ? `${safeName}.env` : `${safeName}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast(`Exported ${format.toUpperCase()} locally.`, "success");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        back={{ href: `/vaults/${vaultId}`, label: "Vault" }}
        title={envName}
        description="Values stay concealed everywhere — editor, history and diffs show key names only."
        action={
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={busy || head === 0} onClick={() => void doExport("env")}>Download .env</Button>
              <Button size="sm" variant="secondary" disabled={busy || head === 0} onClick={() => void doExport("json")}>Download JSON</Button>
            </div>
            <span className="text-[11px] text-faint">Generated locally — a plaintext copy you control.</span>
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <SecretsEditor
          key={editorEpoch}
          vaultId={vaultId}
          envId={envId}
          headRevision={head}
          onCommitted={(newHead) => {
            setHead(newHead);
            void reloadHistory();
          }}
        />

        <Card>
          <CardHeader
            title="History"
            action={
              revisions.length >= 2 && (
                <form
                  className="flex items-center gap-2 text-xs"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (compareFrom === compareTo || !compareFrom || !compareTo) return;
                    setBusy(true);
                    try {
                      setCompareResult(await compareRevisions(vaultId, envId, compareFrom, compareTo));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <select value={compareFrom} onChange={(e) => setCompareFrom(Number(e.target.value))} className="rounded-sm border border-border bg-surface-0 px-2 py-1">
                    <option value={0}>from…</option>
                    {revisions.map((r) => <option key={r.number} value={r.number}>rev {r.number}</option>)}
                  </select>
                  <span className="text-faint">→</span>
                  <select value={compareTo} onChange={(e) => setCompareTo(Number(e.target.value))} className="rounded-sm border border-border bg-surface-0 px-2 py-1">
                    <option value={0}>to…</option>
                    {revisions.map((r) => <option key={r.number} value={r.number}>rev {r.number}</option>)}
                  </select>
                  <Button type="submit" size="sm" variant="secondary" disabled={busy || compareFrom === compareTo || !compareFrom || !compareTo}>Diff</Button>
                </form>
              )
            }
          />
          <CardBody>
            {compareResult && (
              <div className="mb-4 flex items-start justify-between gap-3 rounded-sm border border-border bg-surface-0 px-3 py-2.5">
                <div>
                  <span className="mr-2 text-xs text-muted">Revision {compareFrom} → {compareTo}:</span>
                  <DiffView diff={compareResult} />
                </div>
                <button onClick={() => setCompareResult(null)} className="text-xs text-faint hover:text-text">dismiss</button>
              </div>
            )}

            {revisions.length === 0 ? (
              <EmptyState title="No revisions yet" description="Commit a change to start the history." />
            ) : (
              <ul className="flex flex-col gap-2">
                {revisions.map((revision) => (
                  <li key={revision.id} className="rounded-sm border border-border bg-surface-0 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Revision {revision.number}</span>
                        {revision.number === head && <Badge tone="accent">head</Badge>}
                        <span className="text-[11px] text-faint">
                          {new Date(revision.createdAt).toLocaleString()} · gen {revision.keyGeneration}
                        </span>
                      </div>
                      {revision.number !== head && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Restore Revision ${revision.number}?`,
                              description: `History is kept — this creates Revision ${head + 1} with the restored content.`,
                              confirmLabel: "Restore",
                            });
                            if (!ok) return;
                            setBusy(true);
                            try {
                              const newHead = await restoreRevision(vaultId, envId, revision.number, head);
                              setHead(newHead);
                              setEditorEpoch((epoch) => epoch + 1);
                              toast(`Restored — created revision ${newHead}.`, "success");
                              await reloadHistory();
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                    {revision.message && <p className="mt-1 text-xs text-muted">{revision.message}</p>}
                    <div className="mt-1.5">{diffs[revision.number] && <DiffView diff={diffs[revision.number]} />}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export default function EnvironmentPage({ params }: { params: Promise<{ vaultId: string; envId: string }> }) {
  const { vaultId, envId } = use(params);
  return (
    <UnlockGate>
      <AppShell>
        <EnvironmentInner vaultId={vaultId} envId={envId} />
      </AppShell>
    </UnlockGate>
  );
}
