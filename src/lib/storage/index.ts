import { and, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client";
import { fileChunks } from "../db/schema";

/**
 * Object-storage adapter (ADR-007). Receives ONLY opaque encrypted bytes —
 * by the time data reaches a BlobStore it is secretstream ciphertext produced
 * by src/lib/crypto. Swapping to an S3-compatible adapter later is a drop-in
 * behind this interface; the schema and protocols do not change.
 */
export interface BlobStore {
  putChunk(fileId: string, idx: number, data: Uint8Array): Promise<void>;
  /** Returns null when the chunk does not exist. */
  getChunk(fileId: string, idx: number): Promise<Uint8Array | null>;
  chunkCount(fileId: string): Promise<number>;
  deleteFile(fileId: string): Promise<void>;
}

/** V1 default: Postgres-backed chunks (file_chunks table). Constructed with the
 *  caller's executor so writes can join an enclosing transaction. */
export class PostgresBlobStore implements BlobStore {
  constructor(private readonly executor: DbExecutor) {}

  async putChunk(fileId: string, idx: number, data: Uint8Array): Promise<void> {
    await this.executor.insert(fileChunks).values({ fileId, idx, data });
  }

  async getChunk(fileId: string, idx: number): Promise<Uint8Array | null> {
    const rows = await this.executor
      .select({ data: fileChunks.data })
      .from(fileChunks)
      .where(and(eq(fileChunks.fileId, fileId), eq(fileChunks.idx, idx)))
      .limit(1);
    return rows[0]?.data ?? null;
  }

  async chunkCount(fileId: string): Promise<number> {
    const rows = await this.executor
      .select({ count: sql<number>`count(*)::int` })
      .from(fileChunks)
      .where(eq(fileChunks.fileId, fileId));
    return rows[0]?.count ?? 0;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.executor.delete(fileChunks).where(eq(fileChunks.fileId, fileId));
  }
}
