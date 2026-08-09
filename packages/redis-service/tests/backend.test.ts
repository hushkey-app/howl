import { expect } from "@std/expect";
import { conformanceSchema } from "@hushkey/service-core/conformance";
import { makeKeys, type RedisClientLike, RedisService } from "../mod.ts";
import { FakeRedis } from "./_fake_redis.ts";

const keys = makeKeys("howl", "docs");

function makeService(index: unknown[] = ["name", { path: "score", kind: "number" }]) {
  const redis = new FakeRedis();
  const service = new RedisService(redis, conformanceSchema, {
    collectionName: "docs",
    // deno-lint-ignore no-explicit-any
    index: index as any,
  });
  return { redis, service };
}

const issued = (redis: FakeRedis, name: string) =>
  redis.commands.filter((c) => c[0].toUpperCase() === name);

Deno.test("[backend] the default listing is one ZRANGE page plus one MGET", async () => {
  const { redis, service } = makeService();
  for (let i = 0; i < 5; i++) {
    await service.create({ name: `n${i}`, email: `${i}@b.com`, score: i });
  }
  redis.commands = [];

  const page = await service.find({ limit: 2, skip: 1 });

  expect(page).toHaveLength(2);
  // Redis paged it: no whole-collection read, one MGET for the two documents.
  const ranges = issued(redis, "ZRANGE");
  expect(ranges).toHaveLength(1);
  expect(ranges[0]).toEqual(["ZRANGE", keys.active, "-", "+", "BYLEX", "LIMIT", "1", "2"]);
  expect(issued(redis, "MGET")[0]).toHaveLength(3);
});

Deno.test("[backend] an unfiltered count is a single ZCARD — no documents move", async () => {
  const { redis, service } = makeService();
  for (let i = 0; i < 3; i++) await service.create({ name: `n${i}`, email: `${i}@b.com` });
  redis.commands = [];

  expect(await service.count()).toBe(3);
  expect(issued(redis, "ZCARD")).toEqual([["ZCARD", keys.active]]);
  expect(issued(redis, "MGET")).toHaveLength(0);
});

Deno.test("[backend] an indexed equality intersects server-side instead of scanning", async () => {
  const { redis, service } = makeService();
  await service.create({ name: "Ada", email: "a@b.com" });
  await service.create({ name: "Bob", email: "b@b.com" });
  redis.commands = [];

  const found = await service.find({ query: { name: "Ada" } });

  expect(found.map((d) => d.name)).toEqual(["Ada"]);
  expect(issued(redis, "ZINTER")).toEqual([
    ["ZINTER", "2", keys.active, keys.tag("name", "Ada")],
  ]);
  // One document fetched, not the collection.
  expect(issued(redis, "MGET")[0]).toHaveLength(2);
});

Deno.test("[backend] a numeric range reads the score index, then filters by the base", async () => {
  const { redis, service } = makeService();
  await service.create({ name: "low", email: "l@b.com", score: 1 });
  await service.create({ name: "high", email: "h@b.com", score: 50 });
  redis.commands = [];

  const found = await service.find({ query: { score: { $gte: 10 } } });

  expect(found.map((d) => d.name)).toEqual(["high"]);
  expect(issued(redis, "ZRANGEBYSCORE")).toEqual([
    ["ZRANGEBYSCORE", keys.number("score"), "10", "+inf"],
  ]);
  expect(issued(redis, "ZMSCORE")[0].slice(0, 2)).toEqual(["ZMSCORE", keys.active]);
});

Deno.test("[backend] an undeclared path still answers, by scanning", async () => {
  const { redis, service } = makeService([]);
  await service.create({ name: "Ada", email: "a@b.com" });
  await service.create({ name: "Bob", email: "b@b.com" });
  redis.commands = [];

  const found = await service.find({ query: { email: "b@b.com" } });

  expect(found.map((d) => d.name)).toEqual(["Bob"]);
  expect(issued(redis, "ZRANGE")).toEqual([["ZRANGE", keys.active, "0", "-1"]]);
});

Deno.test("[backend] index entries follow the document through its whole lifecycle", async () => {
  const { redis, service } = makeService();
  const doc = await service.create({ name: "Ada", email: "a@b.com", score: 5 });

  expect(redis.sets.get(keys.tag("name", "Ada"))?.has(doc.id)).toBe(true);
  expect(redis.zsets.get(keys.number("score"))?.get(doc.id)).toBe(5);
  expect(redis.zsets.get(keys.active)?.has(doc.id)).toBe(true);

  // A patch moves the old value's entry to the new one — no stale membership.
  await service.patch(doc.id, { name: "Ada L.", score: 9 });
  expect(redis.sets.get(keys.tag("name", "Ada"))).toBeUndefined();
  expect(redis.sets.get(keys.tag("name", "Ada L."))?.has(doc.id)).toBe(true);
  expect(redis.zsets.get(keys.number("score"))?.get(doc.id)).toBe(9);

  // Soft delete leaves the document (and its indexes) but drops it from active.
  await service.delete(doc.id);
  expect(redis.zsets.get(keys.active)?.has(doc.id)).toBeFalsy();
  expect(redis.zsets.get(keys.ids)?.has(doc.id)).toBe(true);
  expect(redis.sets.get(keys.tag("name", "Ada L."))?.has(doc.id)).toBe(true);

  await service.restore(doc.id);
  expect(redis.zsets.get(keys.active)?.has(doc.id)).toBe(true);

  // A hard delete leaves nothing behind — empty index keys are gone entirely.
  await service.delete(doc.id, { hard: true });
  expect(redis.strings.size).toBe(0);
  expect([...redis.sets.keys()]).toEqual([]);
  expect([...redis.zsets.keys()].filter((k) => (redis.zsets.get(k)?.size ?? 0) > 0)).toEqual([]);
});

// Another writer lands between the read and the compare-and-set: the script
// refuses the stale write, and the backend re-reads and re-applies rather than
// clobbering the concurrent change.
class RacingRedis implements RedisClientLike {
  races: number;
  writes = 0;
  constructor(readonly inner: FakeRedis, races: number) {
    this.races = races;
  }
  sendCommand(args: (string | number)[]): Promise<unknown> {
    const name = String(args[0]).toUpperCase();
    if ((name === "EVAL" || name === "EVALSHA") && this.races > 0) {
      const key = String(args[3]);
      const current = this.inner.strings.get(key);
      // Only an existing document can be raced (an insert has nothing to
      // clobber). Each interference must also differ from the last: the
      // compare-and-set is on the bytes, so rewriting identical content is
      // correctly not a conflict.
      if (current) {
        this.races--;
        this.inner.strings.set(
          key,
          JSON.stringify({ ...JSON.parse(current), raced: ++this.writes }),
        );
      }
    }
    return this.inner.sendCommand(args);
  }
}

Deno.test("[backend] a lost compare-and-set race retries instead of clobbering", async () => {
  const redis = new FakeRedis();
  const service = new RedisService(new RacingRedis(redis, 1), conformanceSchema, {
    collectionName: "docs",
    index: ["name"],
  });
  const doc = await service.create({ name: "Ada", email: "a@b.com" });

  const patched = await service.patch(doc.id, { email: "new@b.com" });
  expect(patched?.email).toBe("new@b.com");

  // Read the stored bytes (the service's return value is schema-parsed, which
  // drops the concurrent writer's undeclared field): the patch landed on top
  // of the concurrent write instead of overwriting it.
  const stored = JSON.parse(redis.strings.get(keys.doc(doc.id))!);
  expect(stored.email).toBe("new@b.com");
  expect(stored.raced).toBe(1);
  expect(stored.version).toBe(2);
});

Deno.test("[backend] retries are bounded, and the failure names the document", async () => {
  const redis = new FakeRedis();
  const service = new RedisService(new RacingRedis(redis, 99), conformanceSchema, {
    collectionName: "docs",
    maxRetries: 2,
  });
  const doc = await service.create({ name: "Ada", email: "a@b.com" });

  await expect(service.patch(doc.id, { email: "new@b.com" })).rejects.toThrow(
    new RegExp(`${doc.id}.*races`),
  );
});

Deno.test("[backend] capabilities say projection/sort are applied above storage", () => {
  const { service } = makeService();
  expect(service.findCapabilities).toEqual({
    project: "approximate",
    sort: "approximate",
    collation: "approximate",
    hint: "none",
  });
  expect(service.backendKind).toBe("redis");
});
