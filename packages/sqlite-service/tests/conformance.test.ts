import { DatabaseSync } from "node:sqlite";
import { conformanceSchema, runConformanceSuite } from "@hushkey/service-core/conformance";
import { type SqliteDbLike, SqliteService } from "../mod.ts";

// Deno's built-in SQLite — no dependency, no WASM, no container. A fresh
// in-memory database per test gives the suite the empty storage it asserts on.
runConformanceSuite("sqlite-native", () => {
  const db = new DatabaseSync(":memory:");
  return Promise.resolve({
    service: new SqliteService(db as unknown as SqliteDbLike, conformanceSchema, {
      collectionName: "conformance",
      promote: [{ path: "score", type: "numeric" }],
    }),
    cleanup: () => {
      db.close();
      return Promise.resolve();
    },
  });
});

// Same suite against a FILE database — exercises the WAL pragma path and
// on-disk persistence rather than the :memory: VFS.
runConformanceSuite("sqlite-file", () => {
  const dir = Deno.makeTempDirSync({ prefix: "howl_sqlite_conf_" });
  const db = new DatabaseSync(`${dir}/conformance.db`);
  return Promise.resolve({
    service: new SqliteService(db as unknown as SqliteDbLike, conformanceSchema, {
      collectionName: "conformance",
      promote: [{ path: "score", type: "numeric" }],
    }),
    cleanup: () => {
      db.close();
      Deno.removeSync(dir, { recursive: true });
      return Promise.resolve();
    },
  });
});
