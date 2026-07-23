"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/src/lib/api/client";
import { approveDevice, deviceFingerprint, lookupPendingDevice } from "@/src/lib/client/flows";
import { AppShell, PageHeader } from "@/src/components/AppShell";
import { UnlockGate } from "@/src/components/UnlockGate";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  useConfirm,
  useToast,
} from "@/src/components/ui";

interface PendingDevice {
  deviceId: string;
  name: string;
  devicePubKey: string;
  fingerprint: string;
}

function DevicesInner() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingDevice | null>(null);
  const [devices, setDevices] = useState<
    { id: string; name: string; createdAt: string; lastUsedAt: string | null; fingerprint: string }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { devices: list } = await api.listDevices();
    setDevices(
      await Promise.all(list.map(async (device) => ({ ...device, fingerprint: await deviceFingerprint(device.devicePubKey) })))
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <PageHeader
        title="CLI devices"
        description={<>Run <code className="rounded bg-surface-2 px-1 text-text">envvault login</code> and approve the device here.</>}
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Connect a device" description="Enter the code shown in your terminal." />
          <CardBody className="flex flex-col gap-4">
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                try {
                  setPending(await lookupPendingDevice(code.toUpperCase().trim()));
                } catch {
                  toast("No pending device with that code (codes expire after 10 minutes).", "error");
                  setPending(null);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex items-end gap-2"
            >
              <div className="w-44">
                <Field label="Device code">
                  <Input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={9}
                    placeholder="ABCD-EFGH"
                    className="font-mono tracking-widest"
                  />
                </Field>
              </div>
              <Button type="submit" loading={busy}>Look up</Button>
            </form>

            {pending && (
              <div className="rounded-sm border border-warn/30 bg-warn-soft p-3.5">
                <p className="text-sm text-text">
                  Device <strong>{pending.name}</strong> requests access to your account&apos;s keys.
                </p>
                <p className="mt-1 text-sm">
                  Fingerprint <span className="font-mono text-warn">{pending.fingerprint}</span>
                </p>
                <p className="mt-1 text-xs text-warn">
                  Approve ONLY if this matches the fingerprint printed in your terminal.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await approveDevice(pending.deviceId, pending.devicePubKey);
                        toast("Device approved — return to your terminal.", "success");
                        setPending(null);
                        setCode("");
                        await reload();
                      } catch {
                        toast("Approval failed (code may have expired).", "error");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await api.denyDevice(pending.deviceId);
                      setPending(null);
                      toast("Denied.", "info");
                    }}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Authorized devices" description="Revoking removes the token and wrapped key." />
          <CardBody>
            {devices.length === 0 ? (
              <EmptyState title="No devices" description="Approved CLI devices appear here." />
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {devices.map((device) => (
                  <li key={device.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{device.name}</span>
                        <Badge>added {new Date(device.createdAt).toLocaleDateString()}</Badge>
                      </div>
                      <span className="font-mono text-[10px] text-faint">
                        {device.fingerprint}
                        {device.lastUsedAt && ` · last used ${new Date(device.lastUsedAt).toLocaleString()}`}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Revoke ${device.name}?`,
                          description: "If the device already decrypted your keys it may retain them — rotate affected vault keys for certainty.",
                          confirmLabel: "Revoke",
                          danger: true,
                        });
                        if (!ok) return;
                        await api.revokeDevice(device.id);
                        toast("Device revoked.", "success");
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
        </Card>
      </div>
    </>
  );
}

export default function DevicesPage() {
  return (
    <UnlockGate>
      <AppShell>
        <DevicesInner />
      </AppShell>
    </UnlockGate>
  );
}
