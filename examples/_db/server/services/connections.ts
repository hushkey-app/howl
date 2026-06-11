import { DatabaseSync } from "node:sqlite";
import type { SqliteDbLike } from "@hushkey/sqlite-service";
import type { PgClientLike } from "@hushkey/pg-service";
import type { Db } from "mongodb";

// Three database connections, one per domain service:
//   users   → SQLite  (node:sqlite file — zero infra, always available)
//   blogs   → Postgres (PG_URL server, or embedded PGlite fallback)
//   reviews → MongoDB  (MONGO_URL required; endpoints answer 503 without it)

const dataDir = `${import.meta.dirname}/../../data`;
Deno.mkdirSync(dataDir, { recursive: true });

export const sqliteDb: SqliteDbLike = new DatabaseSync(
  `${dataDir}/app.db`,
) as unknown as SqliteDbLike;

export const pgClient: PgClientLike = await (async () => {
  const url = Deno.env.get("PG_URL");
  if (url) {
    const { default: pg } = await import("pg");
    return new pg.Pool({ connectionString: url }) as unknown as PgClientLike;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  return await PGlite.create(`${dataDir}/pglite`) as unknown as PgClientLike;
})();

export const mongoDb: Db | null = await (async () => {
  const url = Deno.env.get("MONGO_URL");
  if (!url) return null;
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(url);
  await client.connect();
  return client.db("howl_db_example");
})();
