/**
 * The backend conformance suite. The contract package IS the product — every
 * storage backend (Mongo, pg, sqlite, third-party) runs this same suite
 * against its real storage to prove it honors the document-store contract:
 * string ids, the meta envelope, soft delete by default, optimistic locking,
 * patch merge semantics, mget stitching, and the neutral filter grammar.
 *
 * Usage from a backend package's tests:
 *
 * ```ts
 * import { conformanceSchema, runConformanceSuite } from "@hushkey/service-core/conformance";
 *
 * runConformanceSuite("mongo", async () => {
 *   const service = new MongoService(db, conformanceSchema, { collectionName: "conformance" });
 *   return { service, cleanup: () => client.close() };
 * }, { ignore: !Deno.env.get("MONGO_URL") });
 * ```
 *
 * @module
 */
import { expect } from "@std/expect";
import { z } from "zod";
import { documentSchema } from "../meta/meta.schema.ts";
import type { SchemaLike } from "../schema/schema.interface.ts";
import type { DocumentService } from "../service/document.service.ts";

/** The document shape every backend is exercised with. */
export interface ConformanceDoc {
  /** The document's unique string id. */
  id: string;
  /** A required string field. */
  name: string;
  /** A second independent field for lost-update/merge assertions. */
  email: string;
  /** An optional numeric field for range-operator assertions. */
  score?: number;
  /** Optimistic-lock version. */
  version: number;
  /** Audit / soft-delete envelope. */
  meta: {
    created_at: number;
    created_by: string | null;
    updated_at: number;
    updated_by: string | null;
    deleted_at: number | null;
    deleted_by: string | null;
  };
}

/**
 * The schema for {@link ConformanceDoc} — pass it to the service under test
 * so the suite and the schema can't drift. Typed as the structural
 * {@link SchemaLike} the service constructor accepts.
 */
export const conformanceSchema: SchemaLike<ConformanceDoc> = documentSchema({
  name: z.string(),
  email: z.string(),
  score: z.number().optional(),
});

/** What a backend factory hands the suite for each test. */
export interface ConformanceContext {
  /** A fresh service over empty storage. */
  service: DocumentService<ConformanceDoc>;
  /** Teardown (drop collection/close client); ran after each test. */
  cleanup?: () => Promise<void>;
}

/** Per-suite options. */
export interface ConformanceOptions {
  /** Skip the suite (e.g. when the backing store's URL env is unset). */
  ignore?: boolean;
}

type Ctx = { service: DocumentService<ConformanceDoc> };

const CASES: [string, (ctx: Ctx) => Promise<void>][] = [
  ["create stamps id + meta + version", async ({ service }) => {
    const doc = await service.create({ name: "Ada", email: "a@b.com" }, {
      executionerId: "user-1",
    });
    expect(typeof doc.id).toBe("string");
    expect(doc.version).toBe(1);
    expect(doc.meta.created_by).toBe("user-1");
    expect(doc.meta.updated_by).toBe("user-1");
    expect(doc.meta.deleted_at).toBe(null);
    expect((doc as unknown as Record<string, unknown>)._id).toBeUndefined();
  }],

  ["get returns the document; absent id returns null", async ({ service }) => {
    const created = await service.create({ name: "Ada", email: "a@b.com" });
    expect((await service.get(created.id))?.id).toBe(created.id);
    // A valid-format id that no longer exists: create one and hard-delete it.
    const ghost = await service.create({ name: "Ghost", email: "g@b.com" });
    await service.delete(ghost.id, { hard: true });
    expect(await service.get(ghost.id)).toBe(null);
  }],

  ["soft delete hides; viewDeleted reveals; restore un-deletes", async ({ service }) => {
    const created = await service.create({ name: "Ada", email: "a@b.com" });
    const res = await service.delete(created.id);
    expect(res?.success).toBe(true);
    expect(res?.item?.id).toBe(created.id);

    expect(await service.get(created.id)).toBe(null);
    expect(await service.find()).toHaveLength(0);
    const viewed = await service.get(created.id, { viewDeleted: true });
    expect(typeof viewed?.meta.deleted_at).toBe("number");

    const restored = await service.restore(created.id);
    expect(restored?.meta.deleted_at).toBe(null);
    expect((await service.get(created.id))?.id).toBe(created.id);
  }],

  ["hard delete removes entirely", async ({ service }) => {
    const created = await service.create({ name: "Ada", email: "a@b.com" });
    const res = await service.delete(created.id, { hard: true });
    expect(res?.hard).toBe(true);
    expect(await service.get(created.id, { viewDeleted: true })).toBe(null);
  }],

  ["patch merges, preserves unrelated fields, bumps version", async ({ service }) => {
    const created = await service.create({ name: "Ada", email: "a@b.com" });
    const patched = await service.patch(created.id, { name: "Ada L." });
    expect(patched?.name).toBe("Ada L.");
    expect(patched?.email).toBe("a@b.com");
    expect(patched?.version).toBe(2);
    expect(patched?.meta.updated_at).toBeGreaterThanOrEqual(created.meta.updated_at);
  }],

  ["patch enforces optimistic locking when version supplied", async ({ service }) => {
    const created = await service.create({ name: "Ada", email: "a@b.com" });
    const ok = await service.patch(
      created.id,
      { name: "v2", version: 1 } as Partial<ConformanceDoc>,
    );
    expect(ok?.version).toBe(2);
    await expect(
      service.patch(created.id, { name: "boom", version: 1 } as Partial<ConformanceDoc>),
    ).rejects.toThrow(/Optimistic locking failed/);
  }],

  ["mget stitches input order with nulls for misses", async ({ service }) => {
    const a = await service.create({ name: "A", email: "a@b.com" });
    const ghost = await service.create({ name: "Ghost", email: "g@b.com" });
    await service.delete(ghost.id, { hard: true });
    const b = await service.create({ name: "B", email: "b@b.com" });
    const result = await service.mget([a.id, ghost.id, b.id]);
    expect(result.map((d) => d?.id ?? null)).toEqual([a.id, null, b.id]);
  }],

  ["find honors the filter grammar, sort, skip/limit, select", async ({ service }) => {
    await service.create({ name: "C", email: "c@b.com", score: 30 });
    await service.create({ name: "A", email: "a@b.com", score: 10 });
    await service.create({ name: "B", email: "b@b.com", score: 20 });

    const sorted = await service.find({ sort: { name: 1 } });
    expect(sorted.map((d) => d.name)).toEqual(["A", "B", "C"]);

    const page = await service.find({ sort: { name: 1 }, skip: 1, limit: 1 });
    expect(page.map((d) => d.name)).toEqual(["B"]);

    const gt = await service.find({ query: { score: { $gt: 15 } }, sort: { name: 1 } });
    expect(gt.map((d) => d.name)).toEqual(["B", "C"]);

    const inOp = await service.find({ query: { name: { $in: ["A", "C"] } }, sort: { name: 1 } });
    expect(inOp.map((d) => d.name)).toEqual(["A", "C"]);

    const or = await service.find({
      query: { $or: [{ name: "A" }, { score: { $gte: 30 } }] },
      sort: { name: 1 },
    });
    expect(or.map((d) => d.name)).toEqual(["A", "C"]);

    const projected = await service.find({ select: ["name"], sort: { name: 1 } });
    expect(projected[0].name).toBe("A");
    expect((projected[0] as unknown as Record<string, unknown>).email).toBeUndefined();
  }],

  ["filter operators: $ne $nin $lt $lte $exists and null equality", async ({ service }) => {
    await service.create({ name: "A", email: "a@b.com", score: 10 });
    await service.create({ name: "B", email: "b@b.com", score: 20 });
    await service.create({ name: "C", email: "c@b.com" }); // no score

    // $ne matches documents where the field is absent, too (Mongo semantics)
    const ne = await service.find({ query: { score: { $ne: 10 } }, sort: { name: 1 } });
    expect(ne.map((d) => d.name)).toEqual(["B", "C"]);

    // $nin admits absent fields and excludes listed values
    const nin = await service.find({ query: { name: { $nin: ["A", "B"] } } });
    expect(nin.map((d) => d.name)).toEqual(["C"]);

    // $lt / $lte — absent fields never satisfy a range
    const lt = await service.find({ query: { score: { $lt: 20 } } });
    expect(lt.map((d) => d.name)).toEqual(["A"]);
    const lte = await service.find({ query: { score: { $lte: 20 } }, sort: { name: 1 } });
    expect(lte.map((d) => d.name)).toEqual(["A", "B"]);

    // $exists distinguishes key presence
    const present = await service.find({ query: { score: { $exists: true } }, sort: { name: 1 } });
    expect(present.map((d) => d.name)).toEqual(["A", "B"]);
    const absent = await service.find({ query: { score: { $exists: false } } });
    expect(absent.map((d) => d.name)).toEqual(["C"]);

    // null equality matches absent fields (and stored nulls)
    const nullEq = await service.find({ query: { score: null as unknown as number } });
    expect(nullEq.map((d) => d.name)).toEqual(["C"]);

    // $eq spelled explicitly behaves like bare equality
    const eq = await service.find({ query: { name: { $eq: "B" } } });
    expect(eq.map((d) => d.name)).toEqual(["B"]);
  }],

  ["count respects filters and soft deletes", async ({ service }) => {
    const a = await service.create({ name: "A", email: "a@b.com" });
    await service.create({ name: "B", email: "b@b.com" });
    expect(await service.count()).toBe(2);
    expect(await service.count({ query: { name: "A" } })).toBe(1);
    await service.delete(a.id);
    expect(await service.count()).toBe(1);
    expect(await service.count({ viewDeleted: true })).toBe(2);
  }],
];

/**
 * Register the conformance suite as `Deno.test`s against a backend. The
 * factory must return a fresh service over EMPTY storage for every test —
 * tests assert on whole-collection state (`find()`, `count()`).
 *
 * @param label Suite label, prefixed onto every test name.
 * @param factory Creates the service (and optional cleanup) per test.
 * @param options Pass `ignore: true` to register-but-skip (missing infra).
 */
export function runConformanceSuite(
  label: string,
  factory: () => Promise<ConformanceContext>,
  options: ConformanceOptions = {},
): void {
  for (const [name, fn] of CASES) {
    Deno.test({
      name: `[conformance:${label}] ${name}`,
      ignore: options.ignore ?? false,
      async fn() {
        const ctx = await factory();
        try {
          await fn(ctx);
        } finally {
          await ctx.cleanup?.();
        }
      },
    });
  }
}
