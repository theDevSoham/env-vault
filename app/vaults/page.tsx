"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type InvitationDto } from "@/src/lib/api/client";
import { createVault, decryptVaultListName } from "@/src/lib/client/flows";
import { AppShell, PageHeader } from "@/src/components/AppShell";
import { UnlockGate } from "@/src/components/UnlockGate";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  Spinner,
  useToast,
} from "@/src/components/ui";

interface VaultRow {
  vaultId: string;
  name: string;
  role: string;
}

function VaultsInner() {
  const router = useRouter();
  const toast = useToast();
  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [{ vaults: list }, { invitations: pending }] = await Promise.all([
      api.listVaults(),
      api.myInvitations(),
    ]);
    const rows = await Promise.all(
      list.map(async (item) => ({
        vaultId: item.vaultId,
        role: item.role,
        name: await decryptVaultListName(item).catch(() => "(cannot decrypt)"),
      }))
    );
    setVaults(rows);
    setInvitations(pending);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <PageHeader
        title="Vaults"
        description="Encrypted projects. Names are decrypted locally."
        action={<Button onClick={() => setCreating(true)}>New vault</Button>}
      />

      {invitations.length > 0 && (
        <Card className="mb-6 border-info/30">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold">
            Pending invitations
          </div>
          <div className="divide-y divide-border">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="text-sm">
                  <span className="text-text">Vault invitation</span>
                  <Badge tone="info" className="ml-2">{invitation.role}</Badge>
                  <p className="mt-0.5 text-xs text-faint">
                    The vault name stays encrypted until you join.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    const { state } = await api.acceptInvitation(invitation.id);
                    toast(
                      state === "accepted"
                        ? "Accepted — the owner must approve your key before access."
                        : "Joined the vault.",
                      "success"
                    );
                    await reload();
                  }}
                >
                  Accept
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted">
          <Spinner className="size-4" /> Decrypting vault names…
        </div>
      ) : vaults.length === 0 ? (
        <EmptyState
          title="No vaults yet"
          description="Create your first encrypted vault to start storing secrets."
          action={<Button onClick={() => setCreating(true)}>New vault</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vaults.map((vault) => (
            <Link key={vault.vaultId} href={`/vaults/${vault.vaultId}`}>
              <Card className="h-full p-4 transition-colors hover:border-border-strong">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-medium text-text">{vault.name}</span>
                  <Badge tone={vault.role === "owner" ? "accent" : "neutral"}>{vault.role}</Badge>
                </div>
                <p className="mt-3 font-mono text-[10px] text-faint">{vault.vaultId.slice(0, 8)}…</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New vault"
        description="A vault key is generated in your browser and wrapped to your account."
        size="sm"
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const vaultId = await createVault(newName);
              setNewName("");
              setCreating(false);
              router.push(`/vaults/${vaultId}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Vault name" hint="Encrypted before it leaves this device.">
            <Input autoFocus required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Acme Project" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create vault</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}

export default function VaultsPage() {
  return (
    <UnlockGate>
      <AppShell>
        <VaultsInner />
      </AppShell>
    </UnlockGate>
  );
}
