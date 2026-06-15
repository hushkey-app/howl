import { expect } from "@std/expect";
import { RedisCacheAdapter } from "../adapters/redis/redis-cache.adapter.ts";

/** Minimal in-memory stand-in for the duck-typed Redis client. */
class FakeRedis {
  store = new Map<string, string>();

  get(k: string): Promise<string | null> {
    return Promise.resolve(this.store.has(k) ? this.store.get(k)! : null);
  }
  set(k: string, v: string): Promise<string> {
    this.store.set(k, v);
    return Promise.resolve("OK");
  }
  del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return Promise.resolve(n);
  }
  mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.resolve(keys.map((k) => this.store.has(k) ? this.store.get(k)! : null));
  }
  incr(k: string): Promise<number> {
    const n = parseInt(this.store.get(k) ?? "0", 10) + 1;
    this.store.set(k, String(n));
    return Promise.resolve(n);
  }
  scan(
    _cursor: string,
    _match: string,
    pattern: string,
    _count: string,
    _n: number,
  ): Promise<[string, string[]]> {
    const re = new RegExp(
      "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    return Promise.resolve(["0", [...this.store.keys()].filter((k) => re.test(k))]);
  }
}

Deno.test("set/get round-trips JSON values", async () => {
  const a = new RedisCacheAdapter(new FakeRedis(), "users");
  await a.set("k", { n: 1 });
  expect(await a.get<{ n: number }>("k")).toEqual({ n: 1 });
});

Deno.test("mget returns values aligned to keys with null for misses", async () => {
  const a = new RedisCacheAdapter(new FakeRedis(), "users");
  await a.set("a", 1);
  await a.set("c", 3);
  expect(await a.mget<number>(["a", "b", "c"])).toEqual([1, null, 3]);
});

Deno.test("getVersion starts at 0 and incrementVersion bumps it", async () => {
  const a = new RedisCacheAdapter(new FakeRedis(), "users");
  expect(await a.getVersion()).toBe(0);
  expect(await a.incrementVersion()).toBe(1);
  // incrementVersion refreshes the in-process cache, so this reflects the bump.
  expect(await a.getVersion()).toBe(1);
});

Deno.test("patternless clear is scoped to the keyPrefix namespace", async () => {
  const redis = new FakeRedis();
  const a = new RedisCacheAdapter(redis, "users"); // default keyPrefix 'mongo'
  await a.set("mongo:users:v1:get:1", 1);
  await redis.set("sessions:abc", "keep-me");
  const deleted = await a.clear();
  // Deletes the mongo:* key (and would the version key if present), never the
  // shared 'sessions:' key.
  expect(deleted).toBeGreaterThanOrEqual(1);
  expect(await redis.get("mongo:users:v1:get:1")).toBe(null);
  expect(await redis.get("sessions:abc")).toBe("keep-me");
});

Deno.test("delete removes a single key", async () => {
  const a = new RedisCacheAdapter(new FakeRedis(), "users");
  await a.set("k", 1);
  expect(await a.delete("k")).toBe(true);
  expect(await a.get("k")).toBe(null);
});
