"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type InvitationDto, type MemberDto } from "../lib/api/client";
import { publicKeyFingerprint } from "../lib/crypto";
import { completePendingWraps, invite, previewInvitee, removeMember } from "../lib/client/flows";
import { useSession } from "./useSession";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  DialogFooter,
  Field,
  Input,
  useConfirm,
  useToast,
} from "./ui";

export function MembersPanel({ vaultId, isOwner }: { vaultId: string; isOwner: boolean }) {
  const session = useSession();
  const toast = useToast();
  const { confirm, prompt } = useConfirm();
  const [members, setMembers] = useState<(MemberDto & { fingerprint: string })[]>([]);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTtl, setInviteTtl] = useState("");
  const [preview, setPreview] = useState<{ fingerprint?: string; exists: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { members: list } = await api.members(vaultId);
    setMembers(
      await Promise.all(
        list.map(async (member) => ({ ...member, fingerprint: await publicKeyFingerprint(member.publicKey) }))
      )
    );
    if (isOwner) {
      const { invitations: all } = await api.listVaultInvitations(vaultId);
      setInvitations(all.filter((i) => i.state === "pending" || i.state === "accepted"));
    }
  }, [vaultId, isOwner]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const awaitingWrap = invitations.filter((i) => i.state === "accepted" && !i.envelope);

  return (
    <Card>
      <CardHeader
        title="Members"
        description="Vault access is granted by wrapping the key to each member."
        action={isOwner && <Button size="sm" onClick={() => setInviting(true)}>Invite</Button>}
      />
      <CardBody className="flex flex-col gap-3">
        {awaitingWrap.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-sm border border-info/30 bg-info-soft px-3 py-2 text-sm">
            <span className="text-info">{awaitingWrap.length} invitation(s) awaiting your key approval.</span>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const done = await completePendingWraps(vaultId);
                  toast(`Granted access to ${done} member(s).`, "success");
                  await reload();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Approve &amp; grant
            </Button>
          </div>
        )}

        <ul className="flex flex-col divide-y divide-border">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{member.email}</span>
                  <Badge tone={member.isService ? "info" : member.role === "owner" ? "accent" : "neutral"}>
                    {member.isService ? "service" : member.role}
                  </Badge>
                  {member.expiresAt && (
                    <Badge tone="warn">expires {new Date(member.expiresAt).toLocaleDateString()}</Badge>
                  )}
                </div>
                <span className="font-mono text-[10px] text-faint">{member.fingerprint}</span>
              </div>
              {isOwner && member.userId !== session.userId && (
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const days = await prompt({
                        title: "Temporary access",
                        description: "Expiry blocks API access only. Removing the member rotates keys for cryptographic revocation.",
                        prompt: { label: "Expire after how many days? (leave empty to make permanent)", placeholder: "30", type: "number", defaultValue: member.expiresAt ? "" : "30" },
                        confirmLabel: "Set expiry",
                      });
                      if (days === null) return;
                      const expiresAt = days.trim() === "" ? null : new Date(Date.now() + Number(days) * 86_400_000).toISOString();
                      if (days.trim() !== "" && (!Number.isFinite(Number(days)) || Number(days) < 1)) return;
                      await api.setMemberExpiry(vaultId, member.userId, { expiresAt });
                      toast(expiresAt ? "Expiry set." : "Expiry cleared.", "success");
                      await reload();
                    }}
                  >
                    Expiry
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Remove ${member.email}?`,
                        description: "This rotates the vault key and re-encrypts current state — they lose access to all future changes.",
                        confirmLabel: "Remove & rotate",
                        danger: true,
                      });
                      if (!ok) return;
                      setBusy(true);
                      toast("Rotating vault key and re-encrypting…", "info");
                      try {
                        await removeMember(vaultId, member.userId);
                        toast("Member removed; vault key rotated.", "success");
                        await reload();
                      } catch {
                        toast("Rotation failed — nothing was changed.", "error");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardBody>

      <Dialog open={inviting} onClose={() => { setInviting(false); setPreview(null); }} title="Invite a member" size="sm">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            try {
              const result = await invite(vaultId, inviteEmail, "member", inviteTtl.trim() === "" ? undefined : Number(inviteTtl));
              toast(
                result.flow === "A"
                  ? "Invitation sent with wrapped key — active once they accept."
                  : "Invitation sent. They sign up and accept, then you approve their key here.",
                "success"
              );
              setInviteEmail("");
              setInviteTtl("");
              setPreview(null);
              setInviting(false);
              await reload();
            } catch {
              toast("Invitation failed.", "error");
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Email">
            <Input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onBlur={async () => { if (inviteEmail) setPreview(await previewInvitee(inviteEmail)); }}
              placeholder="teammate@example.com"
            />
          </Field>
          <Field label="Temporary access (optional)" hint="Days until membership expires. Empty = permanent.">
            <Input type="number" min={1} max={365} value={inviteTtl} onChange={(e) => setInviteTtl(e.target.value)} placeholder="e.g. 30" />
          </Field>
          {preview?.exists && (
            <p className="text-xs text-muted">
              Key fingerprint <span className="font-mono text-text">{preview.fingerprint}</span> — verify out-of-band before granting access.
            </p>
          )}
          {preview && !preview.exists && (
            <p className="text-xs text-faint">No account yet — they&apos;ll sign up first, then you approve their key (no keys leave your device).</p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { setInviting(false); setPreview(null); }}>Cancel</Button>
            <Button type="submit" loading={busy}>Send invitation</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </Card>
  );
}
