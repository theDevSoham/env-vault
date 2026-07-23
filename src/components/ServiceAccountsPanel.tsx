"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ServiceAccountDto } from "../lib/api/client";
import { publicKeyFingerprint } from "../lib/crypto";
import { createServiceAccount } from "../lib/client/flows";

/** Machine identities for CI (machine-identities.md §1). Owner-only panel. */
export function ServiceAccountsPanel({ vaultId }: { vaultId: string }) {
  const [accounts, setAccounts] = useState<(ServiceAccountDto & { fingerprint: string })[]>([]);
  const [name, setName] = useState("");
  const [ttlDays, setTtlDays] = useState("");
  const [credential, setCredential] = useState<{ value: string; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { serviceAccounts } = await api.listServiceAccounts(vaultId);
    setAccounts(
      await Promise.all(
        serviceAccounts.map(async (account) => ({
          ...account,
          fingerprint: await publicKeyFingerprint(account.publicKey),
        }))
      )
    );
  }, [vaultId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="rounded border border-neutral-800 p-4">
      <h2 className="mb-2 font-semibold">Service accounts (CI access)</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Machine identities for pipelines. The credential is generated in your browser and shown
        once — the server can authorize it but can never decrypt with it.
      </p>

      {credential && (
        <div className="mb-3 rounded border border-amber-700 bg-amber-950/30 p-3 text-sm">
          <p className="mb-1 font-medium">
            Machine credential (fingerprint <span className="font-mono">{credential.fingerprint}</span>) —
            copy it now, it will not be shown again:
          </p>
          <textarea
            readOnly
            value={credential.value}
            rows={3}
            onFocus={(e) => e.target.select()}
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 font-mono text-xs"
          />
          <p className="mt-1 text-xs text-amber-300">
            Store it as a CI secret (e.g. <code>ENVVAULT_CREDENTIALS</code>). See docs/ci-github-actions.md.
          </p>
          <button onClick={() => setCredential(null)} className="mt-2 rounded border border-neutral-700 px-2 py-0.5 text-xs">
            I stored it — dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            const result = await createServiceAccount(
              vaultId,
              name,
              ttlDays.trim() === "" ? undefined : Number(ttlDays)
            );
            setCredential({ value: result.credential, fingerprint: result.fingerprint });
            setName("");
            setTtlDays("");
            await reload();
          } finally {
            setBusy(false);
          }
        }}
        className="mb-3 flex gap-2"
      >
        <input
          required
          placeholder="Name (e.g. github-actions-prod)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        />
        <input
          type="number"
          min={1}
          max={365}
          placeholder="expiry (days, optional)"
          value={ttlDays}
          onChange={(e) => setTtlDays(e.target.value)}
          className="w-44 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
        />
        <button disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-sm disabled:opacity-50">
          Create
        </button>
      </form>

      {accounts.length === 0 ? (
        <p className="text-sm text-neutral-500">No service accounts.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {accounts.map((account) => (
            <li key={account.userId} className="flex items-center justify-between py-1">
              <span>
                {account.name}
                <span className="ml-2 font-mono text-xs text-neutral-500">{account.fingerprint}</span>
                {account.membershipExpiresAt && (
                  <span className="ml-2 text-xs text-amber-400">
                    expires {new Date(account.membershipExpiresAt).toLocaleDateString()}
                  </span>
                )}
                {account.lastUsedAt && (
                  <span className="ml-2 text-xs text-neutral-600">
                    last used {new Date(account.lastUsedAt).toLocaleString()}
                  </span>
                )}
              </span>
              <button
                onClick={async () => {
                  if (!confirm(`Revoke ${account.name}? Its token dies immediately. If the credential ever decrypted keys, rotate the vault key (remove-member flow) for cryptographic certainty.`)) return;
                  await api.revokeServiceAccount(vaultId, account.userId);
                  await reload();
                }}
                className="rounded border border-red-800 px-2 py-0.5 text-xs text-red-400"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
