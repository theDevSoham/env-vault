import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * SERVER-ONLY database client (plannings/03 C4). The `server-only` import
 * makes any accidental client-component import a build error (Phase H fix
 * SR-1; vitest aliases the package to a stub). Connection string comes
 * exclusively from DATABASE_URL (.env, gitignored).
 */

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export type Db = ReturnType<typeof buildDb>;
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Any query executor: the root client or an open transaction. */
export type DbExecutor = Db | DbTransaction;

function buildDb(p: Pool) {
  return drizzle(p, { schema });
}

let db: Db | undefined;

export function getDb(): Db {
  if (!db) db = buildDb(getPool());
  return db;
}

/** Close the pool (tests / graceful shutdown). */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}
