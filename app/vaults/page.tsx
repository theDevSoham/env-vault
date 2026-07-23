"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type InvitationDto } from "@/src/lib/api/client";
import { createVault, decryptVaultListName, logout } from "@/src/lib/client/flows";
import { UnlockGate } from "@/src/components/UnlockGate";
import { useSession } from "@/src/components/useSession";

interface VaultRow {
  vaultId: string;
  name: string;
  role: string;
}

function VaultsInner() {
  const session = useSession();
  const router = useRouter();
  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

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
    <main className="mx-auto w-full max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your vaults</h1>
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span>{session.email}</span>
          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="rounded border border-neutral-700 px-3 py-1"
          >
            Sign out
          </button>
        </div>
      </header>

      {invitations.length > 0 && (
        <section className="mb-6 rounded border border-sky-800 bg-sky-950/30 p-4">
          <h2 className="mb-2 font-semibold">Pending invitations</h2>
          {invitations.map((invitation) => (
            <div key={invitation.id} className="flex items-center justify-between py-1 text-sm">
              <span className="text-neutral-300">
                Vault invitation · role: {invitation.role}
                <span className="ml-2 text-xs text-neutral-500">
                  (vault name is encrypted until you join)
                </span>
              </span>
              <button
                onClick={async () => {
                  const { state } = await api.acceptInvitation(invitation.id);
                  if (state === "accepted") {
                    alert("Accepted. The vault owner must approve your key before you get access.");
                  }
                  await reload();
                }}
                className="rounded bg-sky-700 px-3 py-1"
              >
                Accept
              </button>
            </div>
          ))}
        </section>
      )}

      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            const vaultId = await createVault(newName);
            setNewName("");
            router.push(`/vaults/${vaultId}`);
          } finally {
            setBusy(false);
          }
        }}
        className="mb-6 flex gap-2"
      >
        <input
          required
          placeholder="New vault name (encrypted before upload)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
        />
        <button disabled={busy} className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50">
          Create vault
        </button>
      </form>

      {loading ? (
        <p className="text-neutral-400">Decrypting vault names…</p>
      ) : vaults.length === 0 ? (
        <p className="text-neutral-500">No vaults yet — create one above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vaults.map((vault) => (
            <li key={vault.vaultId}>
              <Link
                href={`/vaults/${vault.vaultId}`}
                className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-4 py-3 hover:border-neutral-600"
              >
                <span className="font-medium">{vault.name}</span>
                <span className="text-xs uppercase text-neutral-500">{vault.role}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function VaultsPage() {
  return (
    <UnlockGate>
      <VaultsInner />
    </UnlockGate>
  );
}
