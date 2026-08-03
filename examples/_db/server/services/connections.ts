import { DatabaseSync } from "node:sqlite";
import type { SqliteDbLike } from "@hushkey/sqlite-service";
import type { PgClientLike } from "@hushkey/pg-service";
import type { RedisClientLike } from "@hushkey/redis-service";
import type { Db } from "mongodb";

// Four database connections, one per domain service:
//   users    → SQLite  (node:sqlite file — zero infra, always available)
//   blogs    → Postgres (PG_URL server, or embedded PGlite fallback)
//   reviews  → MongoDB  (MONGO_URL required; endpoints answer 503 without it)
//   sessions → Redis    (REDIS_URL, default localhost:6379; 503 without it)

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

// Defaults to the standard local MongoDB port; MONGO_URL overrides.
// Probed with a short timeout so the example still boots (reviews offline)
// when nothing is listening.
export const MONGO_URL: string = Deno.env.get("MONGO_URL") ?? "mongodb://localhost:27017";

// Redis speaks one command dispatcher — ioredis' `call` is the whole adapter.
// Probed the same way as Mongo so the example boots without it.
export const REDIS_URL: string = Deno.env.get("REDIS_URL") ?? "redis://127.0.0.1:6379";

export const redisClient: RedisClientLike | null = await (async () => {
  try {
    const { Redis } = await import("ioredis");
    const url = new URL(REDIS_URL);
    const redis = new Redis({
      host: url.hostname,
      port: Number(url.port || 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    await redis.call("PING");
    return { sendCommand: (args) => redis.call(String(args[0]), ...args.slice(1).map(String)) };
  } catch {
    console.warn(`[connections] Redis unreachable at ${REDIS_URL} — sessions offline`);
    return null;
  }
})();

export const mongoDb: Db | null = await (async () => {
  try {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 1500 });
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    return client.db("howl_db_example");
  } catch {
    console.warn(`[connections] MongoDB unreachable at ${MONGO_URL} — reviews offline`);
    return null;
  }
})();
