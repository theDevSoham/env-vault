import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Standalone migration runner. Applies every SQL migration in ./drizzle to the
 * database in DATABASE_URL, tracked idempotently (already-applied migrations are
 * skipped). Uses only production deps (drizzle-orm + pg) — no drizzle-kit — so
 * it runs cleanly in a deploy/build step.
 *
 * Local:  npm run db:migrate
 * Prod:   DATABASE_URL="<prod url>" npm run db:migrate
 * Vercel: runs automatically via the `vercel-build` script before `next build`.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot run migrations.");
  }
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = drizzle(pool);
    console.log("Applying migrations from ./drizzle …");
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✓ Migrations up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("✗ Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
