import { expect } from "@std/expect";
import { type Db, ObjectId } from "mongodb";
import { z } from "zod";
import { documentSchema } from "@hushkey/service-core/meta";
import { MongoService } from "../mod.ts";
import { FakeCollection, FakeDb } from "./_fake_mongo.ts";

const schema = documentSchema({ name: z.string(), email: z.string() });

function makeService() {
  const db = new FakeDb();
  const service = new MongoService(db as unknown as Db, schema, {
    collectionName: "things",
  });
  const collection = db.collection("things") as FakeCollection;
  return { service, collection };
}

Deno.test("create stamps id + meta + version and never leaks _id", async () => {
  const { service } = makeService();
  const doc = await service.create({ name: "Ada", email: "a@b.com" });
  expect(typeof doc.id).toBe("string");
  expect((doc as Record<string, unknown>)._id).toBeUndefined();
  expect((doc as Record<string, unknown>).version).toBe(1);
  const meta = (doc as Record<string, { created_by: string; deleted_at: number | null }>).meta;
  expect(meta.created_by).toBe("system");
  expect(meta.deleted_at).toBe(null);
});

Deno.test("create records executionerId in the meta audit fields", async () => {
  const { service } = makeService();
  const doc = await service.create({ name: "Ada", email: "a@b.com" }, {
    executionerId: "user-1",
  });
  const meta = (doc as Record<string, { created_by: string; updated_by: string }>).meta;
  expect(meta.created_by).toBe("user-1");
  expect(meta.updated_by).toBe("user-1");
});

Deno.test("get returns the document and null for an unknown id", async () => {
  const { service } = makeService();
  const created = await service.create({ name: "Ada", email: "a@b.com" });
  const got = await service.get(created.id);
  expect(got?.id).toBe(created.id);
  expect(await service.get(new ObjectId().toString())).toBe(null);
});

Deno.test("soft delete hides from get/find but viewDeleted reveals it", async () => {
  const { service } = makeService();
  const created = await service.create({ name: "Ada", email: "a@b.com" });

  const res = await service.delete(created.id);
  expect(res?.success).toBe(true);
  // Result item is normalized like any read path — string id, no _id.
  expect(res?.item?.id).toBe(created.id);
  expect((res?.item as Record<string, unknown>)._id).toBeUndefined();

  expect(await service.get(created.id)).toBe(null);
  expect(await service.find()).toHaveLength(0);

  const viewed = await service.get(created.id, { viewDeleted: true });
  expect(viewed?.id).toBe(created.id);
  const meta = (viewed as Record<string, { deleted_at: number | null }>).meta;
  expect(typeof meta.deleted_at).toBe("number");
});

Deno.test("restore un-deletes a soft-deleted document", async () => {
  const { service } = makeService();
  const created = await service.create({ name: "Ada", email: "a@b.com" });
  await service.delete(created.id);
  const restored = await service.restore(created.id);
  expect(restored?.id).toBe(created.id);
  expect(await service.get(created.id)).not.toBe(null);
});

Deno.test("hard delete removes the document entirely", async () => {
  const { service, collection } = makeService();
  const created = await service.create({ name: "Ada", email: "a@b.com" });
  await service.delete(created.id, { hard: true });
  expect(collection.docs).toHaveLength(0);
  expect(await service.get(created.id, { viewDeleted: true })).toBe(null);
});

Deno.test("patch updates the field, bumps version, and only $sets patched paths", async () => {
  const { service, collection } = makeService();
  const created = await service.create({ name: "Ada", email: "a@b.com" });

  const patched = await service.patch(created.id, { name: "Ada L." });
  expect(patched?.name).toBe("Ada L.");
  expect(patched?.email).toBe("a@b.com");
  expect((patched as Record<string, unknown>).version).toBe(2);

  // Lost-update fix: $set carries only the patched path + meta audit fields,
  // never email or version (version goes through $inc).
  const setKeys = Object.keys(collection.lastUpdate!.$set);
  expect(setKeys).toContain("name");
  expect(setKeys).toContain("meta.updated_at");
  expect(setKeys).not.toContain("email");
  expect(setKeys).not.toContain("version");
  expect(collection.lastUpdate!.$inc).toEqual({ version: 1 });
});

Deno.test("patch enforces optimistic locking when a version is supplied", async () => {
  const { service } = makeService();
  const created = await service.create({ name: "Ada", email: "a@b.com" });

  // Correct version (1) succeeds and increments to 2.
  const ok = await service.patch(created.id, { name: "v2", version: 1 } as Record<string, unknown>);
  expect((ok as Record<string, unknown>).version).toBe(2);

  // Stale version (1 again) is rejected.
  await expect(
    service.patch(created.id, { name: "boom", version: 1 } as Record<string, unknown>),
  ).rejects.toThrow(/Optimistic locking failed/);
});

Deno.test("mget stitches results into input order with null for misses", async () => {
  const { service } = makeService();
  const a = await service.create({ name: "A", email: "a@b.com" });
  const b = await service.create({ name: "B", email: "b@b.com" });
  const absent = new ObjectId().toString();

  const result = await service.mget([a.id, absent, b.id]);
  expect(result.map((d) => d?.id ?? null)).toEqual([a.id, null, b.id]);
});

Deno.test("find supports projection, sort, and skip/limit", async () => {
  const { service } = makeService();
  await service.create({ name: "C", email: "c@b.com" });
  await service.create({ name: "A", email: "a@b.com" });
  await service.create({ name: "B", email: "b@b.com" });

  const sorted = await service.find({ sort: { name: 1 } });
  expect(sorted.map((d) => d.name)).toEqual(["A", "B", "C"]);

  const page = await service.find({ sort: { name: 1 }, skip: 1, limit: 1 });
  expect(page.map((d) => d.name)).toEqual(["B"]);

  const projected = await service.find({ select: ["name"], sort: { name: 1 } });
  expect(projected[0].name).toBe("A");
  expect((projected[0] as Record<string, unknown>).email).toBeUndefined();
});
