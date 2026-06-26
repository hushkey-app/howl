import { expect } from "@std/expect";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { conformanceSchema } from "@hushkey/service-core/conformance";
import { documentSchema } from "@hushkey/service-core";
import { SqliteService } from "../../sqlite-service/mod.ts";
import type { SqliteDbLike } from "../../sqlite-service/mod.ts";
import { studio } from "../mod.ts";

function makeStudio() {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  const docs = new SqliteService(db, conformanceSchema, { collectionName: "docs" });
  const middleware = studio({ services: { docs }, executionerId: "test-admin" });
  const dispatch = (method: string, path: string, body?: unknown) =>
    middleware({
      url: new URL(`http://x${path}`),
      req: new Request(`http://x${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      }),
      next: () => new Response("fell through", { status: 599 }),
    });
  return { dispatch, docs };
}

Deno.test("meta lists services with collection and backend kind", async () => {
  const { dispatch } = makeStudio();
  const res = await dispatch("GET", "/studio/api/meta");
  const body = await res.json();
  expect(body.services).toEqual([{ key: "docs", collection: "docs", backend: "sqlite" }]);
});

Deno.test("null service entries are skipped (offline backends)", async () => {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  const docs = new SqliteService(db, conformanceSchema, { collectionName: "docs" });
  const middleware = studio({ services: { docs, offline: null } });
  const res = await middleware({
    url: new URL("http://x/studio/api/meta"),
    req: new Request("http://x/studio/api/meta"),
    next: () => new Response(null, { status: 599 }),
  });
  const body = await res.json();
  expect(body.services.map((s: { key: string }) => s.key)).toEqual(["docs"]);
});

Deno.test("list returns paginated data plus the unpaginated total", async () => {
  const { dispatch } = makeStudio();
  for (let i = 0; i < 7; i++) {
    await dispatch("POST", "/studio/api/services/docs", {
      name: `n${i}`,
      email: `${i}@b.com`,
    });
  }
  const page = await (await dispatch("GET", "/studio/api/services/docs?limit=3&skip=3")).json();
  expect(page.data).toHaveLength(3);
  expect(page.total).toBe(7);
});

Deno.test("non-studio paths fall through to next()", async () => {
  const { dispatch } = makeStudio();
  const res = await dispatch("GET", "/api/other");
  expect(res.status).toBe(599);
});

Deno.test("full lifecycle: create → list/filter → patch → delete → restore", async () => {
  const { dispatch } = makeStudio();

  const created = await (await dispatch("POST", "/studio/api/services/docs", {
    name: "Ada",
    email: "a@b.com",
    score: 10,
  })).json();
  expect(created.data.version).toBe(1);
  expect(created.data.meta.created_by).toBe("test-admin");
  const id = created.data.id;

  const filtered = await (await dispatch(
    "GET",
    `/studio/api/services/docs?filter=${encodeURIComponent('{"score":{"$gte":5}}')}`,
  )).json();
  expect(filtered.data.map((d: { id: string }) => d.id)).toEqual([id]);
  expect(filtered.total).toBe(1);

  const patched = await (await dispatch("POST", `/studio/api/services/docs/${id}`, {
    name: "Ada L.",
  })).json();
  expect(patched.data.name).toBe("Ada L.");
  expect(patched.data.version).toBe(2);

  await dispatch("DELETE", `/studio/api/services/docs/${id}`);
  const visible = await (await dispatch("GET", "/studio/api/services/docs")).json();
  expect(visible.data).toHaveLength(0);
  const deleted = await (await dispatch("GET", "/studio/api/services/docs?deleted=true")).json();
  expect(deleted.data).toHaveLength(1);

  const restored = await (await dispatch("POST", `/studio/api/services/docs/${id}/restore`)).json();
  expect(restored.data.meta.deleted_at).toBe(null);
});

Deno.test("array insert, bulk update and bulk delete by filter", async () => {
  const { dispatch } = makeStudio();

  const inserted = await (await dispatch("POST", "/studio/api/services/docs", [
    { name: "A", email: "a@b.com", score: 1 },
    { name: "B", email: "b@b.com", score: 2 },
    { name: "C", email: "c@b.com", score: 9 },
  ])).json();
  expect(inserted.count).toBe(3);

  const updated = await (await dispatch("POST", "/studio/api/services/docs/bulk-update", {
    filter: { score: { $lt: 5 } },
    patch: { name: "low" },
  })).json();
  expect(updated.count).toBe(2);
  const all = await (await dispatch("GET", "/studio/api/services/docs")).json();
  expect(all.data.filter((d: { name: string }) => d.name === "low")).toHaveLength(2);
  // bulk patch went through the contract — versions bumped
  expect(all.data.find((d: { name: string }) => d.name === "low").version).toBe(2);

  const deleted = await (await dispatch("POST", "/studio/api/services/docs/bulk-delete", {
    filter: { name: "low" },
  })).json();
  expect(deleted.count).toBe(2);
  const left = await (await dispatch("GET", "/studio/api/services/docs")).json();
  expect(left.total).toBe(1);
  const withDeleted = await (await dispatch("GET", "/studio/api/services/docs?deleted=true"))
    .json();
  expect(withDeleted.total).toBe(3);
});

Deno.test("schema route lists promoted columns, flags + drops orphans", async () => {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  // promote `score` once, then re-open the same table without it → orphan column
  new SqliteService(db, conformanceSchema, {
    collectionName: "docs",
    promote: [{ path: "score", type: "numeric" }],
  });
  const docs = new SqliteService(db, conformanceSchema, { collectionName: "docs" });
  const middleware = studio({ services: { docs } });
  const dispatch = (method: string, path: string, body?: unknown) =>
    middleware({
      url: new URL(`http://x${path}`),
      req: new Request(`http://x${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      }),
      next: () => new Response("fell through", { status: 599 }),
    });

  const schema = await (await dispatch("GET", "/studio/api/services/docs/schema")).json();
  expect(schema.supported).toBe(true);
  const score = schema.columns.find((c: { column: string }) => c.column === "score");
  expect(score.declared).toBe(false);
  expect(schema.columns.find((c: { column: string }) => c.column === "version").declared).toBe(
    true,
  );

  const dropped = await (await dispatch("POST", "/studio/api/services/docs/schema", {
    column: "score",
  })).json();
  expect(dropped.dropped).toBe("score");
  const after = await (await dispatch("GET", "/studio/api/services/docs/schema")).json();
  expect(after.columns.some((c: { column: string }) => c.column === "score")).toBe(false);

  // declared columns are protected at the contract boundary
  const refused = await dispatch("POST", "/studio/api/services/docs/schema", { column: "version" });
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toContain("still declared");
});

Deno.test("schema route migrates an orphan into a declared column, then drops it", async () => {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  // first promotes `email` → column exists; reopen promoting `name` instead, so
  // `email` is now an orphan and `name` is the declared migration target.
  new SqliteService(db, conformanceSchema, { collectionName: "docs", promote: ["email"] });
  const docs = new SqliteService(db, conformanceSchema, {
    collectionName: "docs",
    promote: ["name"],
  });
  const middleware = studio({ services: { docs }, executionerId: "migrator" });
  const dispatch = (method: string, path: string, body?: unknown) =>
    middleware({
      url: new URL(`http://x${path}`),
      req: new Request(`http://x${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      }),
      next: () => new Response("fell through", { status: 599 }),
    });

  const created = await (await dispatch("POST", "/studio/api/services/docs", {
    name: "old-name",
    email: "carry@me.com",
  })).json();
  expect(created.data.version).toBe(1);

  // a non-orphan source is refused (name is declared)
  const refused = await dispatch("POST", "/studio/api/services/docs/schema", {
    from: "name",
    to: "email",
  });
  expect(refused.status).toBe(400);
  expect((await refused.json()).message).toContain("orphan");

  // migrate email → name: copies through the contract, then drops email
  const res = await (await dispatch("POST", "/studio/api/services/docs/schema", {
    from: "email",
    to: "name",
  })).json();
  expect(res.migrated).toBe(1);

  // email column + its JSON key are gone; name carries the value; the contract
  // copy bumped version and stamped audit
  const schema = await (await dispatch("GET", "/studio/api/services/docs/schema")).json();
  expect(schema.columns.some((c: { column: string }) => c.column === "email")).toBe(false);
  const doc = (await (await dispatch("GET", "/studio/api/services/docs")).json()).data[0];
  expect(doc.name).toBe("carry@me.com");
  expect(doc.email).toBeUndefined();
  expect(doc.version).toBe(2);
  expect(doc.meta.updated_by).toBe("migrator");
});

function dispatcher(middleware: ReturnType<typeof studio>) {
  return (method: string, path: string, body?: unknown) =>
    middleware({
      url: new URL(`http://x${path}`),
      req: new Request(`http://x${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      }),
      next: () => new Response("fell through", { status: 599 }),
    });
}

Deno.test("fields endpoint diffs schema vs docs, backfills missing, drops orphans", async () => {
  // Seed under a schema with `legacy`, then serve under one that drops it and
  // adds `tier` (default) — `legacy` becomes orphan, `tier` becomes missing.
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  const seed = new SqliteService(
    db,
    documentSchema({ name: z.string(), legacy: z.string().optional() }),
    { collectionName: "docs" },
  );
  await seed.create({ name: "a", legacy: "x" } as never);
  const docs = new SqliteService(
    db,
    documentSchema({ name: z.string(), tier: z.string().default("free") }),
    { collectionName: "docs" },
  );
  const dispatch = dispatcher(studio({ services: { docs }, executionerId: "test-admin" }));

  const report = await (await dispatch("GET", "/studio/api/services/docs/fields")).json();
  expect(report.orphans).toEqual(["legacy"]);
  expect(report.missing).toEqual([{ field: "tier", default: "free" }]);
  expect(report.sampled).toBe(1);

  // backfill the missing field with its schema default, through the contract
  const bf = await (await dispatch("POST", "/studio/api/services/docs/fields", {
    backfill: "tier",
  })).json();
  expect(bf.backfilled).toBe(1);
  expect(bf.default).toBe("free");

  // drop the orphan field from every document
  const dr = await (await dispatch("POST", "/studio/api/services/docs/fields", {
    drop: "legacy",
  })).json();
  expect(dr.count).toBe(1);

  const after = await (await dispatch("GET", "/studio/api/services/docs/fields")).json();
  expect(after.orphans).toEqual([]);
  expect(after.missing).toEqual([]);
  const doc = (await (await dispatch("GET", "/studio/api/services/docs")).json()).data[0];
  expect(doc.tier).toBe("free");
  expect(doc.legacy).toBeUndefined();
});

Deno.test("fields report ignores soft-deleted docs (active snapshot)", async () => {
  const db = new DatabaseSync(":memory:") as unknown as SqliteDbLike;
  // active doc already carries `tier` (created under the evolved schema)
  const docs = new SqliteService(
    db,
    documentSchema({ name: z.string(), tier: z.string().default("free") }),
    { collectionName: "docs" },
  );
  await docs.create({ name: "live" } as never);
  // an OLD doc with no `tier`, then soft-deleted — must NOT count as missing
  const old = new SqliteService(db, documentSchema({ name: z.string() }), { collectionName: "docs" });
  const goneId = (await old.create({ name: "gone" } as never) as { id: string }).id;
  await docs.delete(goneId);

  const dispatch = dispatcher(studio({ services: { docs }, executionerId: "test-admin" }));
  const report = await (await dispatch("GET", "/studio/api/services/docs/fields")).json();
  expect(report.sampled).toBe(1); // the soft-deleted doc is ignored
  expect(report.missing).toEqual([]); // the active doc already has tier
  expect(report.orphans).toEqual([]);
});

Deno.test("contract violations surface as messages, not crashes", async () => {
  const { dispatch } = makeStudio();
  // schema rejects a missing required field
  const bad = await dispatch("POST", "/studio/api/services/docs", { name: 42 });
  expect(bad.status).toBe(400);
  expect((await bad.json()).message).toContain("Invalid data");
  // unknown service
  const missing = await dispatch("GET", "/studio/api/services/nope");
  expect(missing.status).toBe(404);
  // optimistic-lock conflict maps to 409
  const created = await (await dispatch("POST", "/studio/api/services/docs", {
    name: "Ada",
    email: "a@b.com",
  })).json();
  const conflict = await dispatch("POST", `/studio/api/services/docs/${created.data.id}`, {
    name: "x",
    version: 999,
  });
  expect(conflict.status).toBe(409);
});
