import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
// At runtime this file lives in packages/db/dist; assets are one level up.
const migrationsFolder = resolve(here, "../drizzle");
const timescaleSqlPath = resolve(here, "../sql/timescale.sql");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = postgres(url, { max: 1 });
  try {
    const db = drizzle(client);
    console.log("[migrate] applying Drizzle migrations...");
    await migrate(db, { migrationsFolder });

    console.log("[migrate] applying TimescaleDB setup...");
    const timescaleSql = await readFile(timescaleSqlPath, "utf8");
    // Simple protocol allows multiple statements in one call.
    await client.unsafe(timescaleSql).simple();

    console.log("[migrate] done.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
