import { expect } from "@std/expect";
import { InMemoryLRUCache } from "../cache/in-memory-cache.adapter.ts";

Deno.test("get returns null on miss and the value on hit", async () => {
  const c = new InMemoryLRUCache();
  expect(await c.get("a")).toBe(null);
  await c.set("a", { n: 1 });
  expect(await c.get<{ n: number }>("a")).toEqual({ n: 1 });
});

Deno.test("entries expire after their TTL", async () => {
  const c = new InMemoryLRUCache();
  await c.set("a", 1, 0.01); // 10ms
  expect(await c.get("a")).toBe(1);
  await new Promise((r) => setTimeout(r, 25));
  expect(await c.get("a")).toBe(null);
});

Deno.test("LRU eviction drops the least-recently-used entry at capacity", async () => {
  const c = new InMemoryLRUCache(2);
  await c.set("a", 1);
  await c.set("b", 2);
  await c.get("a"); // touch a → b is now LRU
  await c.set("c", 3); // evicts b
  expect(await c.get("a")).toBe(1);
  expect(await c.get("b")).toBe(null);
  expect(await c.get("c")).toBe(3);
});

Deno.test("clear with a glob pattern removes only matching keys", async () => {
  const c = new InMemoryLRUCache();
  await c.set("mongo:users:v1:get:1", 1);
  await c.set("mongo:users:v1:get:2", 2);
  await c.set("mongo:orgs:v1:get:1", 3);
  const deleted = await c.clear("mongo:users:*");
  expect(deleted).toBe(2);
  expect(await c.get("mongo:users:v1:get:1")).toBe(null);
  expect(await c.get("mongo:orgs:v1:get:1")).toBe(3);
});

Deno.test("clear escapes regex metacharacters in the pattern", async () => {
  const c = new InMemoryLRUCache();
  await c.set("a.b", 1);
  await c.set("axb", 2); // '.' must not match 'x'
  const deleted = await c.clear("a.b");
  expect(deleted).toBe(1);
  expect(await c.get("axb")).toBe(2);
});

Deno.test("clear with no pattern empties the cache", async () => {
  const c = new InMemoryLRUCache();
  await c.set("a", 1);
  await c.set("b", 2);
  expect(await c.clear()).toBe(2);
  expect(c.getSize()).toBe(0);
});
