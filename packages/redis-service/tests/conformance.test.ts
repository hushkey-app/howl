import { conformanceSchema, runConformanceSuite } from "@hushkey/service-core/conformance";
import { RedisService } from "../mod.ts";
import { FakeRedis } from "./_fake_redis.ts";
import { deleteKeys, RespClient } from "./_resp_client.ts";

// The declared indexes the suite runs against: `score` is the numeric field it
// ranges and sorts on, `name`/`email` are its equality fields. Everything the
// suite asks for still works without them — this just exercises the planned
// paths as well as the scan path.
const INDEX = ["name", "email", { path: "score", kind: "number" as const }];

// Always: the contract against the in-memory fake — no infra, the same posture
// as the Mongo suite's fake.
runConformanceSuite("redis-fake", () => {
  return Promise.resolve({
    service: new RedisService(new FakeRedis(), conformanceSchema, {
      collectionName: "conformance",
      index: INDEX,
    }),
  });
});

// The same suite with no declared indexes at all, proving the scan path
// answers every query the planned path does.
runConformanceSuite("redis-fake-scan", () => {
  return Promise.resolve({
    service: new RedisService(new FakeRedis(), conformanceSchema, {
      collectionName: "conformance",
    }),
  });
});

// Gated: the same suite against a real Redis — the only run that exercises the
// Lua compare-and-set script. Set REDIS_URL to enable, e.g.
//   REDIS_URL=redis://127.0.0.1:6379 deno task test:services
const REDIS_URL = Deno.env.get("REDIS_URL");
const RUN_PREFIX = `howl-conf-${Math.floor(performance.now())}`;
let suffix = 0;

runConformanceSuite("redis-real", async () => {
  const client = await RespClient.connect(REDIS_URL!);
  // Fresh collection per test — the suite asserts on whole-collection state.
  const collectionName = `conformance_${++suffix}`;
  return {
    service: new RedisService(client, conformanceSchema, {
      collectionName,
      keyPrefix: RUN_PREFIX,
      index: INDEX,
    }),
    cleanup: async () => {
      await deleteKeys(client, `{${RUN_PREFIX}:${collectionName}}*`);
      client.close();
    },
  };
}, { ignore: !REDIS_URL });
