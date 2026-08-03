import { DatabaseSync } from "node:sqlite";
import { expect } from "@std/expect";
import { z } from "zod";
import { documentSchema } from "@hushkey/service-core";
import { type SqliteDbLike, SqliteService } from "../mod.ts";

interface Item {
  id: string;
  name: string;
  score: number;
  version: number;
  meta: {
    created_at: number;
    created_by: string | null;
    updated_at: number;
    updated_by: string | null;
    deleted_at: number | null;
    deleted_by: string | null;
  };
}

const schema = documentSchema({ name: z.string(), score: z.number() });

function makeService(db: DatabaseSync) {
  return new SqliteService<Item>(db as unknown as SqliteDbLike, schema, {
    collectionName: "items",
    promote: [{ path: "score", type: "numeric" }],
    indexes: [{ keys: { score: 1 }, options: { name: "items_score_hint_idx" } }],
  });
}

Deno.test("sqlite honors a string hint as INDEXED BY", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const service = makeService(db);
    await service.create({ name: "A", score: 10 });
    await service.create({ name: "B", score: 20 });

    const hinted = await service.find({
      query: { score: { $gt: 5 } },
      sort: { score: 1 },
      hint: "items_score_hint_idx",
    });
    expect(hinted.map((d) => d.name)).toEqual(["A", "B"]);
  } finally {
    db.close();
  }
});

Deno.test("sqlite rejects an unknown index and key-pattern hints", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const service = makeService(db);
    await service.create({ name: "A", score: 10 });

    // INDEXED BY is a constraint, not advice — an index SQLite cannot use is
    // an error rather than a silently ignored hint.
    await expect(service.find({ hint: "nope_idx" })).rejects.toThrow();
    await expect(service.find({ hint: { score: 1 } })).rejects.toThrow(/index name/);
  } finally {
    db.close();
  }
});

Deno.test("sqlite advertises its find capabilities", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const service = makeService(db);
    expect(service.findCapabilities).toEqual({
      project: "approximate",
      sort: "native",
      collation: "approximate",
      hint: "native",
    });
  } finally {
    db.close();
  }
});
