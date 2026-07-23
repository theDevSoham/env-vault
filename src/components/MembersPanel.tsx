"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type InvitationDto, type MemberDto } from "../lib/api/client";
import { publicKeyFingerprint } from "../lib/crypto";
import { completePendingWraps, invite, previewInvitee, removeMember } from "../lib/client/flows";
import { useSession } from "./useSession";

export function MembersPanel({ vaultId, isOwner }: { vaultId: string; isOwner: boolean }) {
  const session = useSession();
  const [members, setMembers] = useState<(MemberDto & { fingerprint: string })[]>([]);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [preview, setPreview] = useState<{ fingerprint?: string; exists: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    const { members: list } = await api.members(vaultId);
    setMembers(
      await Promise.all(
        list.map(async (member) => ({
          ...member,
          fingerprint: await publicKeyFingerprint(member.publicKey),
        }))
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
    <section className="rounded border border-neutral-800 p-4">
      <h2 className="mb-3 font-semibold">Members</h2>
      <ul className="mb-4 flex flex-col gap-1 text-sm">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between py-1">
            <span>
              {member.email}
              <span className="ml-2 font-mono text-xs text-neutral-500">{member.fingerprint}</span>
              <span className="ml-2 text-xs uppercase text-neutral-500">
                {member.isService ? "service" : member.role}
              </span>
              {member.expiresAt && (
                <span className="ml-2 text-xs text-amber-400">
                  expires {new Date(member.expiresAt).toLocaleDateString()}
                </span>
              )}
            </span>
            {isOwner && member.userId !== session.userId && (
              <span className="flex gap-2">
              <button
                disabled={busy}
                onClick={async () => {
                  const days = prompt(
                    "Temporary access: expire this membership after how many days? (empty = permanent)\nNote: expiry blocks API access only — removing the member rotates keys.",
                    member.expiresAt ? "" : "30"
                  );
                  if (days === null) return;
                  const expiresAt =
                    days.trim() === ""
                      ? null
                      : new Date(Date.now() + Number(days) * 86_400_000).toISOString();
                  if (days.trim() !== "" && (!Number.isFinite(Number(days)) || Number(days) < 1)) return;
                  await api.setMemberExpiry(vaultId, member.userId, { expiresAt });
                  await reload();
                }}
                className="rounded border border-neutral-700 px-2 py-0.5 text-xs"
              >
                Expiry
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  if (!confirm(`Remove ${member.email}? This rotates the vault key — they lose access to all future changes.`)) return;
                  setBusy(true);
                  setNotice("Rotating vault key and re-encrypting…");
                  try {
                    await removeMember(vaultId, member.userId);
                    setNotice("Member removed; vault key rotated.");
                    await reload();
                  } catch {
                    setNotice("Rotation failed — nothing was changed. Try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded border border-red-800 px-2 py-0.5 text-xs text-red-400 disabled:opacity-50"
              >
                Remove
              </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <>
          {awaitingWrap.length > 0 && (
            <div className="mb-3 rounded border border-sky-800 bg-sky-950/30 p-3 text-sm">
              {awaitingWrap.length} accepted invitation(s) awaiting your key approval.
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const done = await completePendingWraps(vaultId);
                    setNotice(`Granted access to ${done} member(s).`);
                    await reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="ml-3 rounded bg-sky-700 px-2 py-1 text-xs"
              >
                Approve & grant access
              </button>
            </div>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                const result = await invite(vaultId, inviteEmail, "member");
                setNotice(
                  result.flow === "A"
                    ? "Invitation sent with wrapped key — active once they accept."
                    : "Invitation sent. They must sign up and accept; you then approve their key here."
                );
                setInviteEmail("");
                setPreview(null);
                await reload();
              } catch {
                setNotice("Invitation failed.");
              } finally {
                setBusy(false);
              }
            }}
            className="flex flex-col gap-2"
          >
            <div className="flex gap-2">
              <input
                type="email"
                required
                placeholder="Invite by email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onBlur={async () => {
                  if (inviteEmail) setPreview(await previewInvitee(inviteEmail));
                }}
                className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm"
              />
              <button disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-sm disabled:opacity-50">
                Invite
              </button>
            </div>
            {preview?.exists && (
              <p className="text-xs text-neutral-400">
                Key fingerprint: <span className="font-mono">{preview.fingerprint}</span> — verify
                out-of-band with the invitee before granting access.
              </p>
            )}
            {preview && !preview.exists && (
              <p className="text-xs text-neutral-500">
                No account yet — they&apos;ll be asked to sign up first (no keys leave your device).
              </p>
            )}
          </form>
        </>
      )}
      {notice && <p className="mt-2 text-xs text-neutral-400">{notice}</p>}
    </section>
  );
}
