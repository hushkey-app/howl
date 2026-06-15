import { expect } from "@std/expect";
import { assertIdent, compileWhere, type PromotedColumn } from "../filter.compiler.ts";

const promoted = new Map<string, PromotedColumn>([
  ["version", { column: "version", segments: ["version"], type: "bigint" }],
  ["meta.deleted_at", { column: "deleted_at", segments: ["meta", "deleted_at"], type: "bigint" }],
  ["status", { column: "status", segments: ["status"], type: "text" }],
]);

Deno.test("empty filter compiles to 1 with no params", () => {
  const { text, params } = compileWhere({}, promoted);
  expect(text).toBe("1");
  expect(params).toEqual([]);
});

Deno.test("id routes to the primary-key column", () => {
  const { text, params } = compileWhere({ id: "abc" }, promoted);
  expect(text).toBe("id = ?");
  expect(params).toEqual(["abc"]);
});

Deno.test("plain fields compile to natively-typed ->> extraction with raw params", () => {
  const { text, params } = compileWhere({ name: "Ada", score: { $gt: 15 } }, promoted);
  expect(text).toBe("doc->>'$.name' = ? AND doc->>'$.score' > ?");
  expect(params).toEqual(["Ada", 15]);
});

Deno.test("promoted paths route to their generated columns", () => {
  const { text, params } = compileWhere({ status: "active", version: { $gt: 3 } }, promoted);
  expect(text).toBe(`"status" = ? AND "version" > ?`);
  expect(params).toEqual(["active", 3]);
});

Deno.test("null equality is a bare IS NULL (->> maps JSON null and absent both to SQL NULL)", () => {
  expect(compileWhere({ nickname: null }, promoted).text).toBe("doc->>'$.nickname' IS NULL");
  const p = compileWhere({ "meta.deleted_at": null }, promoted);
  expect(p.text).toBe(`"deleted_at" IS NULL`);
  expect(p.params).toEqual([]);
});

Deno.test("booleans bind as integers (JSON booleans extract as 0/1)", () => {
  const { text, params } = compileWhere({ active: true }, promoted);
  expect(text).toBe("doc->>'$.active' = ?");
  expect(params).toEqual([1]);
});

Deno.test("$in expands to an IN list; empty $in is 0", () => {
  const { text, params } = compileWhere({ name: { $in: ["A", "B"] } }, promoted);
  expect(text).toBe("doc->>'$.name' IN (?, ?)");
  expect(params).toEqual(["A", "B"]);
  expect(compileWhere({ name: { $in: [] } }, promoted).text).toBe("0");
});

Deno.test("$ne uses IS NOT so absent fields match", () => {
  const { text } = compileWhere({ name: { $ne: "Ada" } }, promoted);
  expect(text).toBe("doc->>'$.name' IS NOT ?");
});

Deno.test("$nin admits absent fields and excludes listed values", () => {
  const { text } = compileWhere({ name: { $nin: ["A"] } }, promoted);
  expect(text).toBe("(doc->>'$.name' IS NULL OR doc->>'$.name' NOT IN (?))");
});

Deno.test("$exists asks json_type, which distinguishes JSON null from absent", () => {
  expect(compileWhere({ status: { $exists: true } }, promoted).text).toBe(
    "json_type(doc, '$.status') IS NOT NULL",
  );
  expect(compileWhere({ status: { $exists: false } }, promoted).text).toBe(
    "json_type(doc, '$.status') IS NULL",
  );
});

Deno.test("$or/$and recurse with parens", () => {
  const { text, params } = compileWhere(
    { $or: [{ name: "A" }, { score: { $gte: 30 } }] },
    promoted,
  );
  expect(text).toBe("((doc->>'$.name' = ?) OR (doc->>'$.score' >= ?))");
  expect(params).toEqual(["A", 30]);
});

Deno.test("object equality compares minified JSON representations", () => {
  const { text, params } = compileWhere({ address: { city: "Berlin" } }, promoted);
  expect(text).toBe("doc->'$.address' = json(?)");
  expect(params).toEqual(['{"city":"Berlin"}']);
});

Deno.test("nested dot-paths compile to a single JSONPath", () => {
  const { text, params } = compileWhere({ "profile.plan": "pro" }, promoted);
  expect(text).toBe("doc->>'$.profile.plan' = ?");
  expect(params).toEqual(["pro"]);
});

Deno.test("unsupported operators, objects in $in, and bad identifiers throw", () => {
  expect(() => compileWhere({ name: { $regex: "^A" } }, promoted)).toThrow(/unsupported filter/);
  expect(() => compileWhere({ a: { $in: [{ b: 1 }] } }, promoted)).toThrow(/scalar values only/);
  expect(() => compileWhere({ "bad-path; DROP": 1 }, promoted)).toThrow(/invalid identifier/);
  expect(() => assertIdent("ok_name")).not.toThrow();
});
