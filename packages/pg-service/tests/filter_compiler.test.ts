import { expect } from "@std/expect";
import { assertIdent, compileWhere, type PromotedColumn } from "../filter.compiler.ts";

const promoted = new Map<string, PromotedColumn>([
  ["version", { column: "version", segments: ["version"], type: "bigint" }],
  ["meta.deleted_at", { column: "deleted_at", segments: ["meta", "deleted_at"], type: "bigint" }],
  ["status", { column: "status", segments: ["status"], type: "text" }],
]);

Deno.test("empty filter compiles to TRUE with no params", () => {
  const { text, params } = compileWhere({}, promoted);
  expect(text).toBe("TRUE");
  expect(params).toEqual([]);
});

Deno.test("id routes to the primary-key column with a raw param", () => {
  const { text, params } = compileWhere({ id: "abc" }, promoted);
  expect(text).toBe("id = $1");
  expect(params).toEqual(["abc"]);
});

Deno.test("plain fields compile to JSONB equality with JSON params", () => {
  const { text, params } = compileWhere({ name: "Ada" }, promoted);
  expect(text).toBe("doc->'name' = $1::jsonb");
  expect(params).toEqual(['"Ada"']);
});

Deno.test("promoted paths route to their typed columns", () => {
  const { text, params } = compileWhere({ status: "active", version: { $gt: 3 } }, promoted);
  expect(text).toBe(`"status" = $1 AND "version" > $2`);
  expect(params).toEqual(["active", 3]);
});

Deno.test("null equality matches JSON null and absent keys on JSONB paths", () => {
  const { text } = compileWhere({ nickname: null }, promoted);
  expect(text).toBe("(doc->'nickname' IS NULL OR doc->'nickname' = 'null'::jsonb)");
});

Deno.test("null equality on a promoted path is a plain IS NULL (partial-index friendly)", () => {
  const { text, params } = compileWhere({ "meta.deleted_at": null }, promoted);
  expect(text).toBe(`"deleted_at" IS NULL`);
  expect(params).toEqual([]);
});

Deno.test("nested dot-paths compile to chained JSONB extraction", () => {
  const { text, params } = compileWhere({ "profile.plan": "pro" }, promoted);
  expect(text).toBe("doc->'profile'->'plan' = $1::jsonb");
  expect(params).toEqual(['"pro"']);
});

Deno.test("$in expands to an IN list; empty $in is FALSE", () => {
  const { text, params } = compileWhere({ name: { $in: ["A", "B"] } }, promoted);
  expect(text).toBe("doc->'name' IN ($1::jsonb, $2::jsonb)");
  expect(params).toEqual(['"A"', '"B"']);
  expect(compileWhere({ name: { $in: [] } }, promoted).text).toBe("FALSE");
});

Deno.test("$ne uses IS DISTINCT FROM so absent fields match", () => {
  const { text } = compileWhere({ name: { $ne: "Ada" } }, promoted);
  expect(text).toBe("doc->'name' IS DISTINCT FROM $1::jsonb");
});

Deno.test("$nin admits absent fields and excludes listed values", () => {
  const { text } = compileWhere({ name: { $nin: ["A"] } }, promoted);
  expect(text).toBe("(doc->'name' IS NULL OR doc->'name' NOT IN ($1::jsonb))");
});

Deno.test("$exists always inspects the JSONB key, even for promoted paths", () => {
  const { text } = compileWhere({ status: { $exists: true } }, promoted);
  expect(text).toBe("doc->'status' IS NOT NULL");
  expect(compileWhere({ status: { $exists: false } }, promoted).text).toBe(
    "doc->'status' IS NULL",
  );
});

Deno.test("$or/$and recurse with parens and sequential params", () => {
  const { text, params } = compileWhere(
    { $or: [{ name: "A" }, { score: { $gte: 30 } }] },
    promoted,
  );
  expect(text).toBe("((doc->'name' = $1::jsonb) OR (doc->'score' >= $2::jsonb))");
  expect(params).toEqual(['"A"', "30"]);
});

Deno.test("startParam offsets the positional placeholders", () => {
  const { text, params } = compileWhere({ name: "Ada" }, promoted, 3);
  expect(text).toBe("doc->'name' = $3::jsonb");
  expect(params).toEqual(['"Ada"']);
});

Deno.test("object equality without operators compares whole JSONB values", () => {
  const { text, params } = compileWhere({ address: { city: "Berlin" } }, promoted);
  expect(text).toBe("doc->'address' = $1::jsonb");
  expect(params).toEqual(['{"city":"Berlin"}']);
});

Deno.test("unsupported operators and bad identifiers throw", () => {
  expect(() => compileWhere({ name: { $regex: "^A" } }, promoted)).toThrow(/unsupported filter/);
  expect(() => compileWhere({ "bad-path; DROP": 1 }, promoted)).toThrow(/invalid identifier/);
  expect(() => assertIdent("ok_name")).not.toThrow();
});
