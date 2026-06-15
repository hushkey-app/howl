import { expect } from "@std/expect";
import { DatabaseSync } from "node:sqlite";
import { conformanceSchema } from "@hushkey/service-core/conformance";
import { SqliteService } from "../mod.ts";
import type { SqliteDbLike } from "../mod.ts";

// An orphan is a promoted column physically present in the table but no longer
// in the live config — the exact residue the additive `ADD COLUMN` DDL leaves
// when a `promote` entry is removed. Simulate it by promoting `score` once,
// then re-opening the same table without that promote.
function withOrphanScore(): SqliteService<Record<string, unknown> & { id: string }> {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  new SqliteService(db, conformanceSchema, {
    collectionName: "docs",
    promote: [{ path: "score", type: "numeric" }],
  });
  return new SqliteService(db, conformanceSchema, { collectionName: "docs" });
}

Deno.test("schemaAdmin lists promoted columns and flags orphans", async () => {
  const svc = withOrphanScore();
  const admin = svc.schemaAdmin;
  expect(admin).not.toBe(null);

  const byName = Object.fromEntries((await admin!.listColumns()).map((c) => [c.column, c]));
  // always-promoted columns stay declared
  expect(byName.version.declared).toBe(true);
  expect(byName.deleted_at.declared).toBe(true);
  // score is present in storage but absent from the live config → orphan
  expect(byName.score.declared).toBe(false);
});

Deno.test("schemaAdmin drops an orphan column and refuses declared ones", async () => {
  const svc = withOrphanScore();
  const admin = svc.schemaAdmin!;

  await admin.dropColumn("score");
  expect((await admin.listColumns()).some((c) => c.column === "score")).toBe(false);

  // declared columns are protected — remove them from config first
  await expect(admin.dropColumn("version")).rejects.toThrow("still declared");
});

Deno.test("dropColumn purgeData removes the generated column and the JSON key", async () => {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  const seed = new SqliteService(db, conformanceSchema, {
    collectionName: "docs",
    promote: [{ path: "score", type: "numeric" }],
  });
  const created = await seed.create({ name: "a", email: "a@b.com", score: 7 });
  // reopen without score → orphan, then drop with data purge
  const svc = new SqliteService(db, conformanceSchema, { collectionName: "docs" });
  await svc.schemaAdmin!.dropColumn("score", { purgeData: true });

  expect((await svc.schemaAdmin!.listColumns()).some((c) => c.column === "score")).toBe(false);
  const back = await svc.get(created.id);
  expect((back as Record<string, unknown>).score).toBeUndefined();
});

Deno.test("schemaAdmin is null for a still-promoted column (no orphan to clean)", async () => {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  const svc = new SqliteService(db, conformanceSchema, {
    collectionName: "docs",
    promote: [{ path: "score", type: "numeric" }],
  });
  const cols = await svc.schemaAdmin!.listColumns();
  expect(cols.find((c) => c.column === "score")?.declared).toBe(true);
  expect(cols.every((c) => c.declared)).toBe(true);
});
