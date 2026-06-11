import { PGlite } from "@electric-sql/pglite";
import { conformanceSchema, runConformanceSuite } from "@hushkey/service-core/conformance";
import { type PgClientLike, PgService } from "../mod.ts";

// PGlite is real Postgres (WASM build) — generated columns, plpgsql, JSONB
// all behave like a server, so this IS the real-storage conformance run, no
// container needed. One instance at module scope (worker outlives individual
// tests without tripping sanitizers); a teardown test closes it last.
const pglite: PGlite = await PGlite.create();
let suffix = 0;

runConformanceSuite("pg-pglite", () => {
  // Fresh table per test — the suite asserts on whole-collection state.
  const collectionName = `conformance_${++suffix}`;
  return Promise.resolve({
    service: new PgService(pglite as unknown as PgClientLike, conformanceSchema, {
      collectionName,
      promote: [{ path: "score", type: "numeric" }],
    }),
  });
});

Deno.test("[conformance:pg-pglite] teardown", async () => {
  await pglite.close();
});

// Gated: the same suite against a real Postgres server via npm:pg (its Pool
// satisfies PgClientLike directly). Set PG_URL to enable, e.g.
//   PG_URL=postgres://postgres:conf@localhost:54329/howl_conformance deno task test:services
const PG_URL = Deno.env.get("PG_URL");
let realSuffix = 0;

runConformanceSuite("pg-real", async () => {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: PG_URL! });
  // Fresh table per test in the shared database — the suite asserts on
  // whole-collection state.
  const collectionName = `conf_real_${Date.now()}_${++realSuffix}`;
  const service = new PgService(pool as unknown as PgClientLike, conformanceSchema, {
    collectionName,
    promote: [{ path: "score", type: "numeric" }],
  });
  return {
    service,
    cleanup: async () => {
      await pool.query(`DROP TABLE IF EXISTS "${collectionName}"`).catch(() => {});
      await pool.end();
    },
  };
}, { ignore: !PG_URL });
