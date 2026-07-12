import { PGlite } from "@electric-sql/pglite";
import { expect } from "@std/expect";
import { conformanceSchema } from "@hushkey/service-core/conformance";
import { type PgClientLike, PgService } from "../mod.ts";

// PGlite is real Postgres (WASM) — the bulk UPDATE, plpgsql deep-set and JSONB
// all behave like a server, so this exercises the full stack: the service's
// deleteMany/patchMany/deleteWhere/patchWhere → PgBackend.updatePathsWhere → SQL.
const pglite: PGlite = await PGlite.create();
let n = 0;

function makeService() {
  return new PgService(pglite as unknown as PgClientLike, conformanceSchema, {
    collectionName: `bulk_${++n}`,
    promote: [{ path: "score", type: "numeric" }],
  });
}

Deno.test("[bulk] pg backend advertises the bulkWrite capability", () => {
  expect(makeService().bulkWrite).not.toBeNull();
});

Deno.test("[bulk] deleteMany soft-deletes the given ids, returns count", async () => {
  const svc = makeService();
  const a = await svc.create({ name: "a", email: "a@x.com" });
  const b = await svc.create({ name: "b", email: "b@x.com" });
  const c = await svc.create({ name: "c", email: "c@x.com" });

  const count = await svc.deleteMany([a.id, b.id]);
  expect(count).toBe(2);
  // Only c remains active; the deleted rows are excluded from reads.
  expect(await svc.count({})).toBe(1);
  expect(await svc.get(a.id)).toBeNull();
  expect((await svc.get(c.id))?.name).toBe("c");
});

Deno.test("[bulk] soft-delete preserves the rest of each doc's meta", async () => {
  const svc = makeService();
  const a = await svc.create({ name: "a", email: "a@x.com" });
  const createdAt = (a as { meta: { created_at: number } }).meta.created_at;

  await svc.deleteMany([a.id]);

  const raw = await svc.get(a.id, { viewDeleted: true });
  expect((raw as { meta: { created_at: number } }).meta.created_at).toBe(
    createdAt,
  );
  expect(typeof (raw as { meta: { deleted_at: number } }).meta.deleted_at).toBe(
    "number",
  );
});

Deno.test("[bulk] patchMany applies the partial + bumps version", async () => {
  const svc = makeService();
  const a = await svc.create({ name: "a", email: "a@x.com", score: 1 });
  const b = await svc.create({ name: "b", email: "b@x.com", score: 2 });

  const count = await svc.patchMany([a.id, b.id], { score: 99 });
  expect(count).toBe(2);

  const aDoc = await svc.get(a.id);
  expect((aDoc as { score: number }).score).toBe(99);
  expect((aDoc as { version: number }).version).toBe(
    (a as { version: number }).version + 1,
  );
});

Deno.test("[bulk] deleteWhere + patchWhere operate by filter", async () => {
  const svc = makeService();
  await svc.create({ name: "keep", email: "k@x.com", score: 5 });
  await svc.create({ name: "gone", email: "g1@x.com", score: 10 });
  await svc.create({ name: "gone", email: "g2@x.com", score: 10 });

  // Patch only touches `name`, so the score-10 rows still match the delete.
  const patched = await svc.patchWhere({ score: 10 }, { name: "renamed" });
  expect(patched).toBe(2);

  const deleted = await svc.deleteWhere({ score: 10 });
  expect(deleted).toBe(2);
  expect(await svc.count({})).toBe(1);
});

Deno.test("[bulk] empty ids are a no-op; empty filter is refused", async () => {
  const svc = makeService();
  expect(await svc.deleteMany([])).toBe(0);
  expect(await svc.patchMany([], { name: "x" })).toBe(0);
  await expect(svc.deleteWhere({})).rejects.toThrow();
  await expect(svc.patchWhere({}, { name: "x" })).rejects.toThrow();
});

Deno.test("[bulk_write] teardown", async () => {
  await pglite.close();
});
