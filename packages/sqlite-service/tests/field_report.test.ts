import { expect } from "@std/expect";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { documentSchema } from "@hushkey/service-core";
import { SqliteService } from "../mod.ts";
import type { SqliteDbLike } from "../mod.ts";

// Seed schema declares `legacy`; the evolved schema drops it and adds `tier`
// (with a default). Reopening the same table with the evolved schema makes
// `legacy` an orphan document field and `tier` a missing one — the exact
// zero-migration drift `fieldReport` surfaces.
const seedSchema = documentSchema({
  name: z.string(),
  email: z.string(),
  legacy: z.string().optional(),
});
const evolvedSchema = documentSchema({
  name: z.string(),
  email: z.string(),
  tier: z.string().default("free"),
});

async function evolved(): Promise<
  SqliteService<{ id: string; name: string; email: string; tier: string }>
> {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  // deno-lint-ignore no-explicit-any
  const seed = new SqliteService(db, seedSchema as any, { collectionName: "docs" });
  // deno-lint-ignore no-explicit-any
  await (seed as any).create({ name: "a", email: "a@b.com", legacy: "x" });
  // deno-lint-ignore no-explicit-any
  await (seed as any).create({ name: "b", email: "b@b.com", legacy: "y" });
  // deno-lint-ignore no-explicit-any
  return new SqliteService(db, evolvedSchema as any, { collectionName: "docs" });
}

Deno.test("fieldReport flags orphan fields and missing fields with their default", async () => {
  const svc = await evolved();
  const report = await svc.fieldReport();

  expect(report.orphans).toEqual(["legacy"]);
  expect(report.missing).toEqual([{ field: "tier", default: "free" }]);
  expect(report.sampled).toBe(2);
  expect(report.invalid).toBe(0);
});

Deno.test("dropField removes an orphan field from every document, returns the count", async () => {
  const svc = await evolved();
  const count = await svc.dropField("legacy");
  expect(count).toBe(2);

  const after = await svc.fieldReport();
  expect(after.orphans).toEqual([]);
  // the documents no longer carry the key at all
  const docs = await svc.find({ query: {} });
  for (const d of docs) {
    expect("legacy" in (d as Record<string, unknown>)).toBe(false);
  }
});

Deno.test("dropField refuses a still-declared field and the envelope", async () => {
  const svc = await evolved();
  await expect(svc.dropField("name")).rejects.toThrow("still declared");
  await expect(svc.dropField("meta")).rejects.toThrow("envelope");
});

Deno.test("fieldReport ignores soft-deleted documents (active snapshot)", async () => {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  // deno-lint-ignore no-explicit-any
  const svc = new SqliteService(db, evolvedSchema as any, { collectionName: "docs" });
  // active doc carries `tier`; a soft-deleted doc lacks it but must not count
  // deno-lint-ignore no-explicit-any
  await (svc as any).create({ name: "live", email: "l@b.com" });
  // deno-lint-ignore no-explicit-any
  const old = new SqliteService(db, documentSchema({ name: z.string(), email: z.string() }) as any, {
    collectionName: "docs",
  });
  // deno-lint-ignore no-explicit-any
  const gone = await (old as any).create({ name: "gone", email: "g@b.com" });
  await svc.delete((gone as { id: string }).id);

  const report = await svc.fieldReport();
  expect(report.sampled).toBe(1);
  expect(report.missing).toEqual([]);
  expect(report.orphans).toEqual([]);
});

Deno.test("dropField on a key no document carries is a harmless no-op (count 0)", async () => {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  // deno-lint-ignore no-explicit-any
  const svc = new SqliteService(db, evolvedSchema as any, { collectionName: "docs" });
  // deno-lint-ignore no-explicit-any
  await (svc as any).create({ name: "a", email: "a@b.com" });
  // `legacy` is undeclared and present on no document → nothing to remove
  expect(await svc.dropField("legacy")).toBe(0);
});
