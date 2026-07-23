"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RevisionConflict } from "../lib/api/client";
import { newKeyId, type Snapshot, type SnapshotKey } from "../lib/crypto";
import { parseDotenv } from "../lib/client/envformat";
import { commitSnapshot, loadHeadSnapshot } from "../lib/client/flows";

/**
 * The core secrets screen (plannings/05 E4, handoff §7).
 *
 * Key names render after client-side decryption; values are NEVER rendered —
 * value inputs are write-only staging fields. There is no reveal control
 * anywhere by design. All edits stage locally and commit as ONE revision.
 */

interface StagedKey extends SnapshotKey {
  status: "unchanged" | "added" | "modified" | "renamed" | "deleted";
  /** UI-only: a newly staged value; empty string means unchanged for existing keys */
  pendingValue: string;
  originalName: string;
}

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
  const [head, setHead] = useState(headRevision);
  const [baseSnapshot, setBaseSnapshot] = useState<Snapshot | null>(null);
  const [staged, setStaged] = useState<StagedKey[]>([]);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (revision: number) => {
      const snapshot = await loadHeadSnapshot(vaultId, envId, revision);
      setBaseSnapshot(snapshot);
      setStaged(
        snapshot.keys
          .map((key) => ({
            ...key,
            value: key.value,
            status: "unchanged" as const,
            pendingValue: "",
            originalName: key.name,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    },
    [vaultId, envId]
  );

  useEffect(() => {
    void load(head);
  }, [load, head]);

  const dirty = staged.some((key) => key.status !== "unchanged");

  function stageAdd(name: string, value: string): void {
    setStaged((current) => {
      const existing = current.find((k) => k.name === name && k.status !== "deleted");
      if (existing) {
        // same name → stage as value modification
        return current.map((k) =>
          k === existing ? { ...k, status: k.status === "added" ? "added" : "modified", pendingValue: value } : k
        );
      }
      return [
        ...current,
        { id: "", name, value: "", status: "added", pendingValue: value, originalName: name },
      ];
    });
  }

  async function commit(): Promise<void> {
    if (!baseSnapshot) return;
    setBusy(true);
    setNotice("");
    try {
      const keys: SnapshotKey[] = [];
      for (const key of staged) {
        if (key.status === "deleted") continue;
        const id = key.id === "" ? await newKeyId() : key.id;
        const value =
          key.status === "added" || (key.pendingValue !== "" && key.status !== "unchanged")
            ? key.pendingValue
            : key.value;
        keys.push({ id, name: key.name, value });
      }
      const after: Snapshot = { v: 1, keys };
      const number = await commitSnapshot(
        vaultId,
        envId,
        { revision: head, snapshot: baseSnapshot },
        after,
        message || undefined
      );
      setMessage("");
      setHead(number);
      setNotice(`Committed revision ${number}.`);
      onCommitted(number);
    } catch (error) {
      if (error instanceof RevisionConflict) {
        setNotice(
          `Conflict: someone committed revision ${error.currentHead} first. Reloaded latest — please re-apply your changes.`
        );
        setHead(error.currentHead);
      } else {
        setNotice("Commit failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!baseSnapshot) return <p className="text-neutral-400">Decrypting secrets…</p>;

  return (
    <section className="rounded border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Secrets (values stay concealed)</h2>
        <div className="flex gap-2">
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
              setNotice(
                `Staged ${entries.length} keys from ${file.name}` +
                  (invalidLines.length ? ` (skipped lines: ${invalidLines.join(", ")})` : "")
              );
              event.target.value = "";
            }}
          />
          <button
            onClick={() => importRef.current?.click()}
            className="rounded border border-neutral-700 px-3 py-1 text-sm"
          >
            Import .env
          </button>
        </div>
      </div>

      <ul className="mb-4 flex flex-col gap-1">
        {staged.map((key, index) => (
          <li
            key={`${key.id}-${index}`}
            className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
              key.status === "deleted"
                ? "bg-red-950/30 line-through opacity-60"
                : key.status !== "unchanged"
                  ? "bg-emerald-950/30"
                  : ""
            }`}
          >
            <input
              value={key.name}
              disabled={key.status === "deleted"}
              onChange={(event) => {
                const name = event.target.value;
                setStaged((current) =>
                  current.map((k, i) =>
                    i === index
                      ? {
                          ...k,
                          name,
                          status:
                            k.status === "added"
                              ? "added"
                              : name !== k.originalName
                                ? "renamed"
                                : k.pendingValue !== ""
                                  ? "modified"
                                  : "unchanged",
                        }
                      : k
                  )
                );
              }}
              className="w-64 rounded border border-transparent bg-transparent px-1 font-mono focus:border-neutral-600"
            />
            <input
              type="password"
              placeholder={key.status === "added" ? "value (staged)" : "•••••• (set new value)"}
              value={key.pendingValue}
              disabled={key.status === "deleted"}
              onChange={(event) => {
                const pendingValue = event.target.value;
                setStaged((current) =>
                  current.map((k, i) =>
                    i === index
                      ? {
                          ...k,
                          pendingValue,
                          status:
                            k.status === "added"
                              ? "added"
                              : pendingValue !== ""
                                ? "modified"
                                : k.name !== k.originalName
                                  ? "renamed"
                                  : "unchanged",
                        }
                      : k
                  )
                );
              }}
              className="flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-0.5"
              autoComplete="off"
            />
            <span className="w-16 text-right text-xs text-neutral-500">{key.status}</span>
            <button
              onClick={() =>
                setStaged((current) =>
                  key.status === "added"
                    ? current.filter((_, i) => i !== index)
                    : current.map((k, i) =>
                        i === index
                          ? { ...k, status: k.status === "deleted" ? "unchanged" : "deleted" }
                          : k
                      )
                )
              }
              className="text-xs text-red-400"
            >
              {key.status === "deleted" ? "undo" : "✕"}
            </button>
          </li>
        ))}
        {staged.length === 0 && <p className="text-sm text-neutral-500">No secrets yet.</p>}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (newName) {
            stageAdd(newName, newValue);
            setNewName("");
            setNewValue("");
          }
        }}
        className="mb-4 flex gap-2"
      >
        <input
          placeholder="KEY_NAME"
          value={newName}
          onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
          className="w-64 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-sm"
        />
        <input
          type="password"
          placeholder="value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
          autoComplete="off"
        />
        <button className="rounded border border-neutral-700 px-3 py-1 text-sm">Stage</button>
      </form>

      <div className="flex items-center gap-2">
        <input
          placeholder="Change message (optional — never put secrets here)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
        />
        <button
          disabled={!dirty || busy}
          onClick={() => void commit()}
          className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Encrypting…" : `Commit revision ${head + 1}`}
        </button>
      </div>
      {notice && <p className="mt-2 text-xs text-neutral-400">{notice}</p>}
    </section>
  );
}
