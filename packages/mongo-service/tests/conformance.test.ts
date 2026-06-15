import { type Db, MongoClient } from "mongodb";
import { conformanceSchema, runConformanceSuite } from "@hushkey/service-core/conformance";
import { MongoService } from "../mod.ts";
import { FakeDb } from "./_fake_mongo.ts";

// Always: the core conformance suite against the in-memory fake — proves the
// orchestration honors the contract without infra.
runConformanceSuite("mongo-fake", () => {
  const db = new FakeDb() as unknown as Db;
  return Promise.resolve({
    service: new MongoService(db, conformanceSchema, {
      collectionName: "conformance",
    }),
  });
});

// Gated: the same suite against real MongoDB. Set MONGO_URL to enable, e.g.
//   MONGO_URL=mongodb://localhost:27017 deno task test:services
const MONGO_URL = Deno.env.get("MONGO_URL");

runConformanceSuite("mongo-real", async () => {
  const client = new MongoClient(MONGO_URL!);
  await client.connect();
  const db = client.db("howl_conformance");
  // Fresh collection per test — the suite asserts on whole-collection state.
  const collectionName = `c_${crypto.randomUUID().replaceAll("-", "")}`;
  const service = new MongoService(db, conformanceSchema, { collectionName });
  return {
    service,
    cleanup: async () => {
      await db.collection(collectionName).drop().catch(() => {});
      await client.close();
    },
  };
}, { ignore: !MONGO_URL });
