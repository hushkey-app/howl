import { expect } from "@std/expect";
import { type Db } from "mongodb";
import { z } from "zod";
import { documentSchema } from "@hushkey/service-core/meta";
import type { CacheAdapter } from "@hushkey/service-core/cache";
import { MongoService } from "../mod.ts";
import { FakeDb } from "./_fake_mongo.ts";

const schema = documentSchema({ name: z.string(), email: z.string() });

/**
 * Versioned cache adapter that records deletes and can be made to fail its
 * version read/bump on demand — for asserting the HANDOFF fixes.
 */
class RecordingCacheAdapter implements CacheAdapter {
  store = new Map<string, unknown>();
  deleted: string[] = [];
  version = 0;
  failIncrement = false;
  failVersion = false;

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve(this.store.has(key) ? this.store.get(key) as T : null);
  }
  mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.resolve(keys.map((k) => this.store.has(k) ? this.store.get(k) as T : null));
  }
  set<T>(key: string, value: T): Promise<boolean> {
    this.store.set(key, value);
    return Promise.resolve(true);
  }
  delete(key: string): Promise<boolean> {
    this.deleted.push(key);
    return Promise.resolve(this.store.delete(key));
  }
  clear(): Promise<number> {
    const n = this.store.size;
    this.store.clear();
    return Promise.resolve(n);
  }
  getVersion(): Promise<number> {
    if (this.failVersion) return Promise.reject(new Error("version read failed"));
    return Promise.resolve(this.version);
  }
  incrementVersion(): Promise<number> {
    if (this.failIncrement) return Promise.reject(new Error("version bump failed"));
    return Promise.resolve(++this.version);
  }
}

function makeService(adapter: RecordingCacheAdapter) {
  const db = new FakeDb();
  const service = new MongoService(db as unknown as Db, schema, {
    collectionName: "things",
    cache: { enabled: true, adapter },
  });
  return service;
}

Deno.test("patch deletes the pre-bump get key so lagging replicas miss (fix #1)", async () => {
  const adapter = new RecordingCacheAdapter();
  const service = makeService(adapter);

  const created = await service.create({ name: "Ada", email: "a@b.com" }); // version → 1
  await service.get(created.id); // caches under v1
  const v1Key = `mongo:things:v1:get:${created.id}`;
  expect(adapter.store.has(v1Key)).toBe(true);

  await service.patch(created.id, { name: "Ada L." });

  // Old-version key explicitly evicted (not merely orphaned by the bump),
  // and the fresh doc re-cached under the new version.
  expect(adapter.deleted).toContain(v1Key);
  expect(adapter.store.has(v1Key)).toBe(false);
  expect(adapter.store.has(`mongo:things:v2:get:${created.id}`)).toBe(true);
});

Deno.test("a cache-bump failure does not fail a write that already persisted (fix #2)", async () => {
  const adapter = new RecordingCacheAdapter();
  const service = makeService(adapter);

  const created = await service.create({ name: "Ada", email: "a@b.com" });

  adapter.failIncrement = true;
  // The document update has already been written; the version bump throwing
  // must be swallowed, not surfaced to the caller.
  const patched = await service.patch(created.id, { name: "Ada L." });
  expect(patched?.name).toBe("Ada L.");

  adapter.failIncrement = false;
  const got = await service.get(created.id);
  expect(got?.name).toBe("Ada L.");
});

Deno.test("mget degrades to a DB read when the version read throws (fix #3)", async () => {
  const adapter = new RecordingCacheAdapter();
  const service = makeService(adapter);

  const a = await service.create({ name: "A", email: "a@b.com" });
  const b = await service.create({ name: "B", email: "b@b.com" });

  adapter.failVersion = true; // generateCacheKey() inside mget will throw
  const result = await service.mget([a.id, b.id]);
  expect(result.map((d) => d?.id ?? null)).toEqual([a.id, b.id]);
});
