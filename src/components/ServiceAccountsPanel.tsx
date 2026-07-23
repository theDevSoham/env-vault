"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ServiceAccountDto } from "../lib/api/client";
import { publicKeyFingerprint } from "../lib/crypto";
import { createServiceAccount } from "../lib/client/flows";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyField,
  Dialog,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  useConfirm,
  useToast,
} from "./ui";

export function ServiceAccountsPanel({ vaultId }: { vaultId: string }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [accounts, setAccounts] = useState<(ServiceAccountDto & { fingerprint: string })[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [ttlDays, setTtlDays] = useState("");
  const [credential, setCredential] = useState<{ value: string; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { serviceAccounts } = await api.listServiceAccounts(vaultId);
    setAccounts(
      await Promise.all(
        serviceAccounts.map(async (account) => ({ ...account, fingerprint: await publicKeyFingerprint(account.publicKey) }))
      )
    );
  }, [vaultId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Card>
      <CardHeader
        title="Service accounts"
        description="Machine identities for CI. The server can authorize them but never decrypt."
        action={<Button size="sm" onClick={() => setCreating(true)}>New account</Button>}
      />
      <CardBody>
        {accounts.length === 0 ? (
          <EmptyState title="No service accounts" description="Create one to give a pipeline read access to this vault." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {accounts.map((account) => (
              <li key={account.userId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{account.name}</span>
                    <Badge tone="info">service</Badge>
                    {account.membershipExpiresAt && (
                      <Badge tone="warn">expires {new Date(account.membershipExpiresAt).toLocaleDateString()}</Badge>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-faint">
                    {account.fingerprint}
                    {account.lastUsedAt && ` · last used ${new Date(account.lastUsedAt).toLocaleString()}`}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Revoke ${account.name}?`,
                      description: "Its token dies immediately. If the credential ever decrypted keys, also rotate the vault key (remove a member) for cryptographic certainty.",
                      confirmLabel: "Revoke",
                      danger: true,
                    });
                    if (!ok) return;
                    await api.revokeServiceAccount(vaultId, account.userId);
                    toast("Service account revoked.", "success");
                    await reload();
                  }}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Dialog
        open={creating}
        onClose={() => { if (!credential) setCreating(false); }}
        title="New service account"
        description="The keypair is generated in your browser; the credential is shown once."
      >
        {credential ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-sm border border-warn/30 bg-warn-soft p-3 text-xs text-warn">
              Copy this credential now — it will not be shown again. Store it as a CI secret named{" "}
              <code className="font-mono">ENVVAULT_CREDENTIALS</code>.
            </div>
            <CopyField value={credential.value} multiline />
            <p className="text-xs text-faint">Fingerprint <span className="font-mono">{credential.fingerprint}</span></p>
            <DialogFooter>
              <Button
                onClick={() => {
                  setCredential(null);
                  setCreating(false);
                  void reload();
                }}
              >
                I stored it — done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                const result = await createServiceAccount(vaultId, name, ttlDays.trim() === "" ? undefined : Number(ttlDays));
                setCredential({ value: result.credential, fingerprint: result.fingerprint });
                setName("");
                setTtlDays("");
              } finally {
                setBusy(false);
              }
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Name">
              <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="github-actions-prod" />
            </Field>
            <Field label="Expiry (optional)" hint="Days until access expires. Empty = permanent.">
              <Input type="number" min={1} max={365} value={ttlDays} onChange={(e) => setTtlDays(e.target.value)} placeholder="e.g. 90" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" loading={busy}>Create</Button>
            </DialogFooter>
          </form>
        )}
      </Dialog>
    </Card>
  );
}
