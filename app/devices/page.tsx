"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/src/lib/api/client";
import {
  approveDevice,
  deviceFingerprint,
  lookupPendingDevice,
} from "@/src/lib/client/flows";
import { UnlockGate } from "@/src/components/UnlockGate";

interface PendingDevice {
  deviceId: string;
  name: string;
  devicePubKey: string;
  fingerprint: string;
}

function DevicesInner() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingDevice | null>(null);
  const [devices, setDevices] = useState<
    { id: string; name: string; createdAt: string; lastUsedAt: string | null; fingerprint: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    const { devices: list } = await api.listDevices();
    setDevices(
      await Promise.all(
        list.map(async (device) => ({
          ...device,
          fingerprint: await deviceFingerprint(device.devicePubKey),
        }))
      )
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <header className="mb-6">
        <Link href="/vaults" className="text-sm text-neutral-500 hover:text-neutral-300">
          ← Vaults
        </Link>
        <h1 className="text-2xl font-bold">CLI devices</h1>
      </header>

      <section className="mb-6 rounded border border-neutral-800 p-4">
        <h2 className="mb-2 font-semibold">Connect a device</h2>
        <p className="mb-3 text-sm text-neutral-400">
          Run <code className="rounded bg-neutral-900 px-1">envvault login</code> in your terminal
          and enter the code it shows.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setNotice("");
            try {
              setPending(await lookupPendingDevice(code.toUpperCase().trim()));
            } catch {
              setNotice("No pending device with that code (codes expire after 10 minutes).");
              setPending(null);
            } finally {
              setBusy(false);
            }
          }}
          className="flex gap-2"
        >
          <input
            required
            placeholder="ABCD-EFGH"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={9}
            className="w-40 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono tracking-widest"
          />
          <button disabled={busy} className="rounded bg-emerald-600 px-4 py-2 disabled:opacity-50">
            Look up
          </button>
        </form>

        {pending && (
          <div className="mt-4 rounded border border-amber-700 bg-amber-950/30 p-3 text-sm">
            <p>
              Device <strong>{pending.name}</strong> requests access to your account&apos;s keys.
            </p>
            <p className="mt-1">
              Key fingerprint: <span className="font-mono">{pending.fingerprint}</span>
            </p>
            <p className="mt-1 text-xs text-amber-300">
              Approve ONLY if this fingerprint matches the one printed in your terminal.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await approveDevice(pending.deviceId, pending.devicePubKey);
                    setNotice("Device approved — return to your terminal.");
                    setPending(null);
                    setCode("");
                    await reload();
                  } catch {
                    setNotice("Approval failed (code may have expired).");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded bg-emerald-600 px-3 py-1.5 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  await api.denyDevice(pending.deviceId);
                  setPending(null);
                  setNotice("Denied.");
                }}
                className="rounded border border-neutral-700 px-3 py-1.5"
              >
                Deny
              </button>
            </div>
          </div>
        )}
        {notice && <p className="mt-2 text-xs text-neutral-400">{notice}</p>}
      </section>

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="mb-2 font-semibold">Authorized devices</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-neutral-500">None.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between py-1">
                <span>
                  {device.name}
                  <span className="ml-2 font-mono text-xs text-neutral-500">{device.fingerprint}</span>
                  <span className="ml-2 text-xs text-neutral-600">
                    added {new Date(device.createdAt).toLocaleDateString()}
                    {device.lastUsedAt && ` · last used ${new Date(device.lastUsedAt).toLocaleString()}`}
                  </span>
                </span>
                <button
                  onClick={async () => {
                    if (!confirm(`Revoke ${device.name}? If the device already decrypted your keys it may retain them — rotate affected vault keys for certainty.`)) return;
                    await api.revokeDevice(device.id);
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
        <p className="mt-3 text-xs text-neutral-600">
          Revoking removes the device&apos;s access token and wrapped key. A device that already
          used its key may retain it — rotating vault keys is the cryptographic guarantee.
        </p>
      </section>
    </main>
  );
}

export default function DevicesPage() {
  return (
    <UnlockGate>
      <DevicesInner />
    </UnlockGate>
  );
}
