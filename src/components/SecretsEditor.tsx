"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RevisionConflict } from "../lib/api/client";
import { newKeyId, type Snapshot, type SnapshotKey } from "../lib/crypto";
import { parseDotenv } from "../lib/client/envformat";
import { commitSnapshot, decryptRevisionDiff, loadSnapshot } from "../lib/client/flows";
import { api } from "../lib/api/client";
import { Badge, Button, Card, CardBody, CardHeader, Input, Spinner, useToast } from "./ui";

/**
 * The core secrets screen (plannings/05 E4, handoff §7).
 * Key names render after decryption; values are NEVER rendered — value inputs
 * are write-only. No reveal control anywhere. Edits stage locally; commit = one
 * revision. Conflict → rebase staged ops onto the new head (handoff §30).
 */

interface StagedKey extends SnapshotKey {
  status: "unchanged" | "added" | "modified" | "renamed" | "deleted";
  pendingValue: string;
  originalName: string;
}

const STATUS_TONE = {
  added: "accent",
  modified: "warn",
  renamed: "info",
  deleted: "danger",
  unchanged: "neutral",
} as const;

export function SecretsEditor({
  vaultId,
  envId,
  headRevision,
  onCommitted,
}: {
  vaultId: string;
  envId: string;
  headRevision: number;
  onCommitted: (newHead: number) => void;
}) {
  const toast = useToast();
  const [head, setHead] = useState(headRevision);
  const [baseSnapshot, setBaseSnapshot] = useState<Snapshot | null>(null);
  const [staged, setStaged] = useState<StagedKey[]>([]);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const pendingRebase = useRef<StagedKey[] | null>(null);

  const load = useCallback(
    async (revision: number) => {
      const snapshot = await loadSnapshot(vaultId, envId, revision);
      setBaseSnapshot(snapshot);
      let fresh: StagedKey[] = snapshot.keys
        .map((key) => ({
          ...key,
          value: key.value,
          status: "unchanged" as StagedKey["status"],
          pendingValue: "",
          originalName: key.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const rebase = pendingRebase.current;
      if (rebase) {
        pendingRebase.current = null;
        for (const op of rebase) {
          if (op.status === "added") {
            if (!fresh.some((k) => k.name === op.name)) fresh = [...fresh, { ...op, id: "" }];
            continue;
          }
          const index = fresh.findIndex((k) => k.id === op.id || k.name === op.originalName);
          if (index === -1) continue;
          fresh = fresh.map((k, i) => (i === index ? { ...k, name: op.name, pendingValue: op.pendingValue, status: op.status } : k));
        }
      }
      setStaged(fresh);
    },
    [vaultId, envId]
  );

  useEffect(() => {
    void load(head);
  }, [load, head]);

  const dirty = staged.some((key) => key.status !== "unchanged");
  const changeCount = staged.filter((k) => k.status !== "unchanged").length;

  function stageAdd(name: string, value: string): void {
    setStaged((current) => {
      const existing = current.find((k) => k.name === name && k.status !== "deleted");
      if (existing) {
        return current.map((k) => (k === existing ? { ...k, status: k.status === "added" ? "added" : "modified", pendingValue: value } : k));
      }
      return [...current, { id: "", name, value: "", status: "added", pendingValue: value, originalName: name }];
    });
  }

  async function describeUpstream(oldHead: number, newHead: number): Promise<string> {
    try {
      const { revisions } = await api.listRevisions(vaultId, envId);
      const missed = revisions.filter((r) => r.number > oldHead && r.number <= newHead);
      const parts: string[] = [];
      for (const meta of missed) {
        const diff = await decryptRevisionDiff(vaultId, envId, meta);
        parts.push([...diff.added.map((n) => `+${n}`), ...diff.modified.map((n) => `~${n}`), ...diff.renamed.map((r) => `${r.from}→${r.to}`), ...diff.removed.map((n) => `−${n}`)].join(" "));
      }
      return parts.filter(Boolean).join("; ");
    } catch {
      return "";
    }
  }

  async function commit(): Promise<void> {
    if (!baseSnapshot) return;
    setBusy(true);
    try {
      const keys: SnapshotKey[] = [];
      for (const key of staged) {
        if (key.status === "deleted") continue;
        const id = key.id === "" ? await newKeyId() : key.id;
        const value = key.status === "added" || (key.pendingValue !== "" && key.status !== "unchanged") ? key.pendingValue : key.value;
        keys.push({ id, name: key.name, value });
      }
      const after: Snapshot = { v: 1, keys };
      const number = await commitSnapshot(vaultId, envId, { revision: head, snapshot: baseSnapshot }, after, message || undefined);
      setMessage("");
      setHead(number);
      toast(`Committed revision ${number}.`, "success");
      onCommitted(number);
    } catch (error) {
      if (error instanceof RevisionConflict) {
        pendingRebase.current = staged.filter((key) => key.status !== "unchanged");
        const upstream = await describeUpstream(head, error.currentHead);
        toast(
          `Conflict: someone else committed first (now at revision ${error.currentHead}).` +
            (upstream ? ` Their changes: ${upstream}.` : "") +
            " Your changes were re-applied on top — review and commit again.",
          "error"
        );
        setHead(error.currentHead);
      } else {
        toast("Commit failed.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!baseSnapshot) {
    return (
      <Card>
        <CardBody className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4" /> Decrypting secrets…
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Secrets <span className="text-xs font-normal text-faint">values stay concealed</span>
          </span>
        }
        action={
          <>
            <input
              ref={importRef}
              type="file"
              accept=".env,text/plain"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const { entries, invalidLines } = parseDotenv(await file.text());
                for (const entry of entries) stageAdd(entry.name, entry.value);
                toast(`Staged ${entries.length} keys from ${file.name}` + (invalidLines.length ? ` (skipped lines ${invalidLines.join(", ")})` : ""), "info");
                event.target.value = "";
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => importRef.current?.click()}>Import .env</Button>
          </>
        }
      />
      <CardBody className="flex flex-col gap-3">
        {staged.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">No secrets yet — add one below or import a .env file.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {staged.map((key, index) => (
              <li
                key={`${key.id}-${index}`}
                className={
                  "flex items-center gap-2 rounded-sm px-2 py-1.5 " +
                  (key.status === "deleted" ? "bg-danger-soft opacity-70" : key.status !== "unchanged" ? "bg-accent-soft" : "")
                }
              >
                <div className="w-56 shrink-0 sm:w-64">
                  <Input
                    value={key.name}
                    disabled={key.status === "deleted"}
                    onChange={(event) => {
                      const name = event.target.value;
                      setStaged((current) =>
                        current.map((k, i) =>
                          i === index
                            ? { ...k, name, status: k.status === "added" ? "added" : name !== k.originalName ? "renamed" : k.pendingValue !== "" ? "modified" : "unchanged" }
                            : k
                        )
                      );
                    }}
                    className={"border-transparent bg-transparent font-mono " + (key.status === "deleted" ? "line-through" : "")}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    type="password"
                    placeholder={key.status === "added" ? "value (staged)" : "•••••• set new value"}
                    value={key.pendingValue}
                    disabled={key.status === "deleted"}
                    autoComplete="off"
                    onChange={(event) => {
                      const pendingValue = event.target.value;
                      setStaged((current) =>
                        current.map((k, i) =>
                          i === index
                            ? { ...k, pendingValue, status: k.status === "added" ? "added" : pendingValue !== "" ? "modified" : k.name !== k.originalName ? "renamed" : "unchanged" }
                            : k
                        )
                      );
                    }}
                  />
                </div>
                <div className="hidden w-16 shrink-0 justify-end sm:flex">
                  {key.status !== "unchanged" && <Badge tone={STATUS_TONE[key.status]}>{key.status}</Badge>}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setStaged((current) =>
                      key.status === "added"
                        ? current.filter((_, i) => i !== index)
                        : current.map((k, i) => (i === index ? { ...k, status: k.status === "deleted" ? "unchanged" : "deleted" } : k))
                    )
                  }
                  className="w-14 shrink-0 text-right text-xs text-faint hover:text-danger"
                >
                  {key.status === "deleted" ? "undo" : "remove"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (newName) {
              stageAdd(newName, newValue);
              setNewName("");
              setNewValue("");
            }
          }}
          className="flex items-center gap-2 border-t border-border pt-3"
        >
          <div className="w-56 shrink-0 sm:w-64">
            <Input placeholder="KEY_NAME" value={newName} onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} className="font-mono" />
          </div>
          <div className="min-w-0 flex-1">
            <Input type="password" placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} autoComplete="off" />
          </div>
          <Button type="submit" variant="secondary">Stage</Button>
        </form>

        <div className="flex items-center gap-2">
          <Input placeholder="Change message (optional — never put secrets here)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} className="flex-1" />
          <Button disabled={!dirty} loading={busy} onClick={() => void commit()}>
            {busy ? "Encrypting…" : `Commit${changeCount ? ` ${changeCount} change${changeCount > 1 ? "s" : ""}` : ""}`}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
