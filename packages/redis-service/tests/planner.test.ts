import { expect } from "@std/expect";
import { indexMap, makeKeys, planFilter } from "../mod.ts";

const keys = makeKeys("howl", "blogs");
const indexes = indexMap(["status", { path: "likes", kind: "number" }]);
const plan = (filter: Record<string, unknown>) => planFilter(filter, indexes, keys);

Deno.test("[planner] an empty filter scans every id", () => {
  const result = plan({});
  expect(result.base).toBe(keys.ids);
  expect(result.sources).toEqual([]);
  expect(result.scan).toBe(true);
  expect(result.exact).toBe(true);
});

Deno.test("[planner] the soft-delete condition selects the active set exactly", () => {
  for (const condition of [null, { $eq: null }]) {
    const result = plan({ "meta.deleted_at": condition });
    expect(result.base).toBe(keys.active);
    expect(result.exact).toBe(true);
    expect(result.scan).toBe(true);
  }
});

Deno.test("[planner] tag equality and $in become set sources", () => {
  const eq = plan({ "meta.deleted_at": null, status: "live" });
  expect(eq.base).toBe(keys.active);
  expect(eq.sources).toEqual([{ kind: "intersect", keys: [keys.tag("status", "live")] }]);
  expect(eq.exact).toBe(true);

  const inOp = plan({ status: { $in: ["live", "draft"] } });
  expect(inOp.sources).toEqual([{
    kind: "union",
    keys: [keys.tag("status", "live"), keys.tag("status", "draft")],
  }]);
  expect(inOp.exact).toBe(true);
});

Deno.test("[planner] numeric conditions become one score range", () => {
  expect(plan({ likes: { $gte: 10, $lt: 20 } }).sources).toEqual([
    { kind: "range", key: keys.number("likes"), min: "10", max: "(20" },
  ]);
  expect(plan({ likes: { $gt: 5 } }).sources).toEqual([
    { kind: "range", key: keys.number("likes"), min: "(5", max: "+inf" },
  ]);
  expect(plan({ likes: 7 }).sources).toEqual([
    { kind: "range", key: keys.number("likes"), min: "7", max: "7" },
  ]);
});

Deno.test("[planner] a top-level $or over tag paths unions their sets", () => {
  const result = plan({ $or: [{ status: "live" }, { status: "draft" }] });
  expect(result.sources).toEqual([{
    kind: "union",
    keys: [keys.tag("status", "live"), keys.tag("status", "draft")],
  }]);
  expect(result.exact).toBe(true);
});

Deno.test("[planner] $and branches contribute their sources", () => {
  const result = plan({
    $and: [{ status: "live", "meta.deleted_at": null }, { likes: { $gte: 3 } }],
  });
  expect(result.base).toBe(keys.active);
  expect(result.sources).toEqual([
    { kind: "intersect", keys: [keys.tag("status", "live")] },
    { kind: "range", key: keys.number("likes"), min: "3", max: "+inf" },
  ]);
  expect(result.exact).toBe(true);
});

// Every case below must emit NO source: the index would miss documents the
// filter matches, and under-selecting is the one failure a plan may not have.
Deno.test("[planner] conditions an index cannot answer soundly fall to the re-check", () => {
  const unsound: Record<string, unknown>[] = [
    { status: null }, // null equality also matches an absent key
    { status: { $ne: "live" } }, // $ne matches absent keys too
    { status: { $nin: ["live"] } },
    { status: { $exists: true } }, // presence is not a value
    { status: { $in: ["live", null] } },
    { status: { tier: "gold" } }, // object equality is structural, not textual
    { likes: { $ne: 3 } },
    { author: "ada" }, // undeclared path
  ];
  for (const filter of unsound) {
    const result = plan(filter);
    expect({ filter, sources: result.sources, exact: result.exact }).toEqual({
      filter,
      sources: [],
      exact: false,
    });
  }
});

Deno.test("[planner] every key of a collection shares one cluster hash tag", () => {
  const all = [
    keys.ids,
    keys.active,
    keys.doc("abc"),
    keys.tag("status", "live"),
    keys.number("likes"),
  ];
  expect(all.every((key) => key.startsWith("{howl:blogs}"))).toBe(true);
  // Distinct value types never collide on one key.
  expect(keys.tag("status", "1")).not.toBe(keys.tag("status", 1));
  expect(keys.tag("status", "true")).not.toBe(keys.tag("status", true));
});
