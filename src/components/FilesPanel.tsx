"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type FileDto } from "../lib/api/client";
import { decryptFileName, downloadFile, uploadFile } from "../lib/client/flows";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  useConfirm,
  useToast,
} from "./ui";

export function FilesPanel({ vaultId, isOwner }: { vaultId: string; isOwner: boolean }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [files, setFiles] = useState<(FileDto & { name: string })[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const { files: list } = await api.listFiles(vaultId);
    setFiles(
      await Promise.all(
        list.map(async (file) => ({ ...file, name: await decryptFileName(vaultId, file).catch(() => "(cannot decrypt)") }))
      )
    );
  }, [vaultId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <Card>
      <CardHeader
        title="Secret files"
        description="Certificates, service-account JSON, .pem — encrypted client-side."
        action={
          isOwner && (
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
                    toast(`Uploaded ${file.name} (encrypted).`, "success");
                    await reload();
                  } finally {
                    setBusy(false);
                    event.target.value = "";
                  }
                }}
              />
              <Button size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
                {busy ? "Encrypting…" : "Upload"}
              </Button>
            </>
          )
        }
      />
      <CardBody>
        {files.length === 0 ? (
          <EmptyState title="No files" description="Encrypted files you upload appear here." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-sm">{file.name}</span>
                  <Badge>{formatSize(file.sizeBytes)}</Badge>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const { name, blob } = await downloadFile(vaultId, file);
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = name;
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download
                  </Button>
                  {isOwner && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        const ok = await confirm({ title: `Delete ${file.name}?`, confirmLabel: "Delete", danger: true });
                        if (!ok) return;
                        await api.deleteFile(vaultId, file.id);
                        toast("File deleted.", "success");
                        await reload();
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
