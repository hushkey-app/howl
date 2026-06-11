import { expect } from "@std/expect";
import { PGlite } from "@electric-sql/pglite";
import { conformanceSchema } from "@hushkey/service-core/conformance";
import { type PgClientLike, PgService } from "../mod.ts";

// PGlite is real Postgres (WASM) — generated columns and information_schema
// behave like a server, so this exercises the real DDL path.
const pglite: PGlite = await PGlite.create();
let suffix = 0;

// Promote `score` once (forcing readiness so the column exists), then re-open
// the same table without that promote so `score` becomes an orphan.
async function withOrphanScore(): Promise<PgService<Record<string, unknown> & { id: string }>> {
  const collectionName = `schema_admin_${++suffix}`;
  const first = new PgService(pglite as unknown as PgClientLike, conformanceSchema, {
    collectionName,
    promote: [{ path: "score", type: "numeric" }],
  });
  await first.count({}); // awaits #ready — guarantees the score column is created
  return new PgService(pglite as unknown as PgClientLike, conformanceSchema, { collectionName });
}

Deno.test("schemaAdmin lists promoted columns and flags orphans", async () => {
  const svc = await withOrphanScore();
  const admin = svc.schemaAdmin;
  expect(admin).not.toBe(null);

  const byName = Object.fromEntries((await admin!.listColumns()).map((c) => [c.column, c]));
  expect(byName.version.declared).toBe(true);
  expect(byName.deleted_at.declared).toBe(true);
  expect(byName.score.declared).toBe(false);
});

Deno.test("schemaAdmin drops an orphan column (index cascades) and refuses declared", async () => {
  const svc = await withOrphanScore();
  const admin = svc.schemaAdmin!;

  await admin.dropColumn("score");
  expect((await admin.listColumns()).some((c) => c.column === "score")).toBe(false);

  await expect(admin.dropColumn("version")).rejects.toThrow("still declared");
});

Deno.test("dropColumn purgeData removes the generated column and the JSON key", async () => {
  const collectionName = `schema_admin_${++suffix}`;
  const seed = new PgService(pglite as unknown as PgClientLike, conformanceSchema, {
    collectionName,
    promote: [{ path: "score", type: "numeric" }],
  });
  const created = await seed.create({ name: "a", email: "a@b.com", score: 7 });
  const svc = new PgService(pglite as unknown as PgClientLike, conformanceSchema, {
    collectionName,
  });
  await svc.schemaAdmin!.dropColumn("score", { purgeData: true });

  expect((await svc.schemaAdmin!.listColumns()).some((c) => c.column === "score")).toBe(false);
  const back = await svc.get(created.id);
  expect((back as Record<string, unknown>).score).toBeUndefined();
});

Deno.test("[schema_admin] teardown", async () => {
  await pglite.close();
});
