"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { api } from "@/src/lib/api/client";
import { createEnvironment, loadVault, type DecryptedVault } from "@/src/lib/client/flows";
import { AppShell, PageHeader } from "@/src/components/AppShell";
import { FilesPanel } from "@/src/components/FilesPanel";
import { MembersPanel } from "@/src/components/MembersPanel";
import { ServiceAccountsPanel } from "@/src/components/ServiceAccountsPanel";
import { UnlockGate } from "@/src/components/UnlockGate";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  Spinner,
  useConfirm,
  useToast,
} from "@/src/components/ui";

function VaultInner({ vaultId }: { vaultId: string }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [vault, setVault] = useState<DecryptedVault | null>(null);
  const [addingEnv, setAddingEnv] = useState(false);
  const [newEnvName, setNewEnvName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setVault(await loadVault(vaultId));
  }, [vaultId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!vault) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner className="size-4" /> Decrypting vault…
      </div>
    );
  }
  const isOwner = vault.detail.role === "owner";

  return (
    <>
      <PageHeader
        back={{ href: "/vaults", label: "Vaults" }}
        title={vault.name}
        description={
          <span className="flex items-center gap-2">
            <Badge tone={isOwner ? "accent" : "neutral"}>{vault.detail.role}</Badge>
            <span className="text-xs text-faint">key generation {vault.detail.vault.keyGeneration}</span>
          </span>
        }
        action={
          isOwner && (
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete "${vault.name}"?`,
                  description: "This permanently destroys the vault and everything in it. This cannot be undone.",
                  confirmLabel: "Delete vault",
                  danger: true,
                });
                if (!ok) return;
                await api.deleteVault(vaultId);
                router.replace("/vaults");
              }}
            >
              Delete vault
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader
            title="Environments"
            description="Deployment contexts within this vault."
            action={isOwner && <Button size="sm" onClick={() => setAddingEnv(true)}>Add environment</Button>}
          />
          <CardBody>
            {vault.environments.length === 0 ? (
              <EmptyState
                title="No environments"
                description={isOwner ? "Create Development, Staging or Production to hold secrets." : "The owner hasn't created any yet."}
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {vault.environments.map((environment) => (
                  <Link key={environment.id} href={`/vaults/${vaultId}/env/${environment.id}`}>
                    <div className="flex items-center justify-between rounded-sm border border-border bg-surface-0 px-4 py-3 transition-colors hover:border-border-strong">
                      <span className="font-medium">{environment.name}</span>
                      <Badge>rev {environment.headRevision}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <MembersPanel vaultId={vaultId} isOwner={isOwner} />
        {isOwner && <ServiceAccountsPanel vaultId={vaultId} />}
        <FilesPanel vaultId={vaultId} isOwner={isOwner} />
      </div>

      <Dialog open={addingEnv} onClose={() => setAddingEnv(false)} title="Add environment" size="sm">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              await createEnvironment(vaultId, newEnvName);
              setNewEnvName("");
              setAddingEnv(false);
              toast("Environment created.", "success");
              await reload();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Name" hint="e.g. Development, Staging, Production">
            <Input autoFocus required value={newEnvName} onChange={(e) => setNewEnvName(e.target.value)} placeholder="Development" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAddingEnv(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}

export default function VaultPage({ params }: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = use(params);
  return (
    <UnlockGate>
      <AppShell>
        <VaultInner vaultId={vaultId} />
      </AppShell>
    </UnlockGate>
  );
}
