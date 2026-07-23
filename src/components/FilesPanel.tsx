"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type FileDto } from "../lib/api/client";
import { decryptFileName, downloadFile, uploadFile } from "../lib/client/flows";

export function FilesPanel({ vaultId, isOwner }: { vaultId: string; isOwner: boolean }) {
  const [files, setFiles] = useState<(FileDto & { name: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const { files: list } = await api.listFiles(vaultId);
    setFiles(
      await Promise.all(
        list.map(async (file) => ({
          ...file,
          name: await decryptFileName(vaultId, file).catch(() => "(cannot decrypt)"),
        }))
      )
    );
  }, [vaultId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="rounded border border-neutral-800 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Secret files</h2>
        {isOwner && (
          <>
            <input
              ref={inputRef}
              type="file"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setBusy(true);
                try {
                  await uploadFile(vaultId, file);
                  await reload();
                } finally {
                  setBusy(false);
                  event.target.value = "";
                }
              }}
            />
            <button
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded bg-emerald-600 px-3 py-1 text-sm disabled:opacity-50"
            >
              {busy ? "Encrypting…" : "Upload (encrypted)"}
            </button>
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-neutral-500">No files.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between py-1">
              <span className="font-mono">{file.name}</span>
              <span className="flex gap-2">
                <button
                  onClick={async () => {
                    const { name, blob } = await downloadFile(vaultId, file);
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = name;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded border border-neutral-700 px-2 py-0.5 text-xs"
                >
                  Download
                </button>
                {isOwner && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete ${file.name}?`)) return;
                      await api.deleteFile(vaultId, file.id);
                      await reload();
                    }}
                    className="rounded border border-red-800 px-2 py-0.5 text-xs text-red-400"
                  >
                    Delete
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
