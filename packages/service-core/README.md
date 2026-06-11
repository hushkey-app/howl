# @hushkey/service-core

Backend-independent contract for the hushkey document-store service layer.

The core owns everything that is not storage-specific:

- **`DocumentService`** (`./service`) — the orchestrator: write-boundary validation, the
  audit/soft-delete meta envelope, soft delete by default, optimistic locking via `version`,
  versioned cache invalidation (including the read-your-writes old-key eviction), operation
  timeouts, telemetry.
- **Neutral filter grammar** (`./filter`) — `$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists` +
  dot-paths. Mongo passes it through; SQL backends compile it.
- **`StorageBackend`** (`./backend`) — the contract backends implement:
  `insertOne / findOne / findMany / count / updatePaths / deleteOne` + `generateId` + `cachePrefix`.
- **`SchemaLike`** (`./schema`) — structural validator interface; zod object schemas satisfy it
  without a hard zod pin in public types.
- **`Meta` + `metaSchema` + `documentSchema`** (`./meta`) — the envelope, aligned with the deployed
  hushkey contract (nullable `*_by` for legacy docs).
- **Adapters** — `CacheAdapter` + in-memory LRU (`./cache`), `TelemetryAdapter` (`./telemetry`),
  `RedisCacheAdapter` (`./adapters/redis`), `OpenTelemetryAdapter` (`./adapters/otel`).
- **Conformance suite** (`./conformance`) — every backend runs the same behavioral suite against its
  real storage; this is how a third-party backend stays honest.

The first backend is [`@hushkey/mongo-service`](../mongo-service/README.md); pg/sqlite follow the
same contract.

## Positioning

A **Mongo-shaped document store**, _not_ Mongo-compatible. Document-store semantics over any
storage; SQL backends store docs as JSONB/JSON1, never relational tables. Aggregations, `$regex`,
`$elemMatch`, array update operators and text search are explicitly out — those live behind
per-backend escape hatches, uncached.

## Cache-key safety

Cache keys are `<cachePrefix>:<collection>:v<version>:get|find:…`. The prefix is owned by the
backend (`mongo`, `sql`, …); `DocumentService` verifies at construction that a version-owning
adapter (e.g. `RedisCacheAdapter`) is configured with the same prefix and throws on mismatch — a
silent mismatch would make patternless `clear()` miss every entry.

## Conformance

```ts
import { conformanceSchema, runConformanceSuite } from "@hushkey/service-core/conformance";

runConformanceSuite("mongo", async () => {
  const service = new MongoService(db, conformanceSchema, { collectionName: "conformance" });
  return { service, cleanup: () => client.close() };
}, { ignore: !Deno.env.get("MONGO_URL") });
```

## Peers

- **zod** `^4` — the bundled meta schema. The service itself only needs `SchemaLike`.

> `deno doc --lint` note: the only accepted warnings are `private-type-ref` on zod types in
> `metaSchema`/`documentSchema` signatures — composition requires real zod types, and re-exporting
> them would pull zod's internal type graph.
