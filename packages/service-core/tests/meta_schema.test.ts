import { expect } from "@std/expect";
import { z } from "zod";
import { documentSchema, metaSchema } from "../meta/meta.schema.ts";

const activeMeta = {
  created_at: 1,
  created_by: "system",
  updated_at: 1,
  updated_by: "system",
  deleted_at: null,
  deleted_by: null,
};

Deno.test("metaSchema accepts an active envelope", () => {
  expect(metaSchema.safeParse(activeMeta).success).toBe(true);
});

Deno.test("metaSchema accepts a soft-deleted envelope", () => {
  const r = metaSchema.safeParse({
    ...activeMeta,
    deleted_at: 123,
    deleted_by: "admin",
  });
  expect(r.success).toBe(true);
});

Deno.test("metaSchema rejects a non-numeric timestamp", () => {
  const r = metaSchema.safeParse({ ...activeMeta, created_at: "nope" });
  expect(r.success).toBe(false);
});

Deno.test("metaSchema tolerates null audit actors (legacy docs)", () => {
  const r = metaSchema.safeParse({
    ...activeMeta,
    created_by: null,
    updated_by: null,
  });
  expect(r.success).toBe(true);
});

Deno.test("documentSchema wraps a shape with id + version + meta", () => {
  const schema = documentSchema({ name: z.string() });
  const r = schema.safeParse({
    id: "abc",
    version: 1,
    name: "Ada",
    meta: activeMeta,
  });
  expect(r.success).toBe(true);
});

Deno.test("documentSchema strips unknown keys", () => {
  const schema = documentSchema({ name: z.string() });
  const r = schema.parse({
    id: "abc",
    version: 1,
    name: "Ada",
    meta: activeMeta,
    rogue: "drop me",
  });
  expect("rogue" in r).toBe(false);
});

Deno.test("documentSchema requires the meta block", () => {
  const schema = documentSchema({ name: z.string() });
  const r = schema.safeParse({ id: "abc", version: 1, name: "Ada" });
  expect(r.success).toBe(false);
});
