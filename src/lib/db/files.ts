import { and, eq } from "drizzle-orm";
import { PostgresBlobStore } from "../storage";
import { appendAudit } from "./audit";
import type { Db, DbExecutor } from "./client";
import { NotFoundError } from "./errors";
import { secretFiles } from "./schema";

/**
 * Encrypted secret files (handoff §22, ADR-007). Rows hold metadata + the
 * enc.stream envelope; ciphertext chunks go through the BlobStore adapter.
 * Everything here is ciphertext-in/ciphertext-out.
 */

export interface CreateFileInput {
  vaultId: string;
  actorUserId: string;
  nameEnv: unknown; // enc.rec — encrypted filename
  streamEnv: unknown; // enc.stream
  keyGeneration: number;
  chunks: Uint8Array[]; // secretstream ciphertext chunks, in order
}

export async function createSecretFile(db: Db, input: CreateFileInput): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const sizeBytes = input.chunks.reduce((sum, c) => sum + c.length, 0);
    const [file] = await tx
      .insert(secretFiles)
      .values({
        vaultId: input.vaultId,
        nameEnv: input.nameEnv,
        streamEnv: input.streamEnv,
        sizeBytes,
        keyGeneration: input.keyGeneration,
      })
      .returning({ id: secretFiles.id });
    const store = new PostgresBlobStore(tx);
    for (let i = 0; i < input.chunks.length; i++) {
      await store.putChunk(file.id, i, input.chunks[i]);
    }
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: "secret_file_uploaded",
      context: { fileId: file.id, sizeBytes },
    });
    return file;
  });
}

/** Replace a file's content (new stream + chunks) — handoff §27 'secret file replaced'. */
export async function replaceSecretFile(
  db: Db,
  fileId: string,
  input: {
    vaultId: string;
    actorUserId: string;
    streamEnv: unknown;
    keyGeneration: number;
    chunks: Uint8Array[];
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const sizeBytes = input.chunks.reduce((sum, c) => sum + c.length, 0);
    const updated = await tx
      .update(secretFiles)
      .set({
        streamEnv: input.streamEnv,
        sizeBytes,
        keyGeneration: input.keyGeneration,
        updatedAt: new Date(),
      })
      .where(and(eq(secretFiles.id, fileId), eq(secretFiles.vaultId, input.vaultId)))
      .returning({ id: secretFiles.id });
    if (updated.length === 0) throw new NotFoundError("secret file not found");
    const store = new PostgresBlobStore(tx);
    await store.deleteFile(fileId);
    for (let i = 0; i < input.chunks.length; i++) {
      await store.putChunk(fileId, i, input.chunks[i]);
    }
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: "secret_file_replaced",
      context: { fileId, sizeBytes },
    });
  });
}

export async function getSecretFile(executor: DbExecutor, vaultId: string, fileId: string) {
  const rows = await executor
    .select()
    .from(secretFiles)
    .where(and(eq(secretFiles.id, fileId), eq(secretFiles.vaultId, vaultId)))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("secret file not found");
  return rows[0];
}

export async function listSecretFiles(executor: DbExecutor, vaultId: string) {
  return executor.select().from(secretFiles).where(eq(secretFiles.vaultId, vaultId));
}

export async function deleteSecretFile(
  db: Db,
  fileId: string,
  input: { vaultId: string; actorUserId: string }
): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(secretFiles)
      .where(and(eq(secretFiles.id, fileId), eq(secretFiles.vaultId, input.vaultId)))
      .returning({ id: secretFiles.id });
    if (deleted.length === 0) throw new NotFoundError("secret file not found");
    // chunks cascade via FK
    await appendAudit(tx, {
      vaultId: input.vaultId,
      actorUserId: input.actorUserId,
      type: "secret_file_deleted",
      context: { fileId },
    });
  });
}
