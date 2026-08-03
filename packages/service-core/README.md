# @hushkey/service-core

Backend-independent contract for the hushkey document-store service layer.

The core owns everything that is not storage-specific:

- **`DocumentService`** (`./service`) — the orchestrator: write-boundary validation, the
  audit/soft-delete meta envelope, soft delete by default, optimistic locking via `version`,
  versioned cache invalidation (including the read-your-writes old-key eviction), operation
  timeouts, telemetry.
- **Neutral filter grammar** (`./filter`) — `$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists` +
  dot-paths. Mongo passes it through; SQL backends compile it.
- **Query options** (`./query`) — the shaping knobs that ride next to the filter on `find()`:
  `project`, `sort`, `collation`, `hint` (plus `limit`/`skip`). See [Find options](#find-options)
  for the semantics and the per-backend support matrix.
- **`StorageBackend`** (`./backend`) — the contract backends implement:
  `insertOne / findOne / findMany / count / updatePaths / deleteOne / unsetField` + `generateId` +
  `cachePrefix`. `unsetField(field)` bulk-removes a top-level JSON key from every document that has
  it (sqlite `json_remove`, pg `doc - key`, mongo `$unset`) — a storage-maintenance primitive below
  the contract, used to reclaim an **orphan** document field. Plus an **optional `SchemaAdmin`
  capability** (`listColumns` / `dropColumn`) for promoted-column introspection and orphan cleanup,
  feature-detected via `service.schemaAdmin` (`null` when the backend has no column concept). Drops
  are refused for columns still declared in the live config — the additive promote config stays the
  source of truth; this surface only cleans up the orphans it leaves behind.
  `dropColumn(col, {
  purgeData: true })` also strips the matching top-level JSON key (used by the
  studio's rename/migrate flow once the data has been copied to its new field). Consumed by
  [`@hushkey/studio`](../studio/README.md)'s schema view.
- **Schema ⇄ documents diff** — `DocumentService.fieldReport()` samples documents and diffs them
  against the live schema (by validating each — keys the schema strips are **orphans**, keys it
  fills by default are **missing**), returning the missing fields with their defaults and the orphan
  field names. It diffs **active documents only** — soft-deleted docs are ignored, so the report is
  a live snapshot and backfilling clears it. `dropField(field)` removes an orphan field across every
  document (via `unsetField`, refusing envelope or still-declared fields). The zero-migration
  evolution path: backfill the missing fields, drop the orphans — both surfaced one-click in the
  studio's schema view.
- **`SchemaLike`** (`./schema`) — structural validator interface; zod object schemas satisfy it
  without a hard zod pin in public types.
- **`Meta` + `metaSchema` + `documentSchema`** (`./meta`) — the envelope, aligned with the deployed
  hushkey contract (nullable `*_by` for legacy docs).
- **Adapters** — `CacheAdapter` + in-memory LRU (`./cache`), `TelemetryAdapter` (`./telemetry`),
  `RedisCacheAdapter` (`./adapters/redis`), `OpenTelemetryAdapter` (`./adapters/otel`).
- **Conformance suite** (`./conformance`) — every backend runs the same behavioral suite against its
  real storage; this is how a third-party backend stays honest.

Backends implementing this contract, all running the same conformance suite:
[`@hushkey/mongo-service`](../mongo-service/README.md) (the first),
[`@hushkey/pg-service`](../pg-service/README.md) and
[`@hushkey/sqlite-service`](../sqlite-service/README.md) (documents as JSONB/JSON1), and
[`@hushkey/redis-service`](../redis-service/README.md) (documents plus hand-maintained secondary
indexes in plain Redis — Redis as the database, not a cache).

## Positioning

A **Mongo-shaped document store**, _not_ Mongo-compatible. Document-store semantics over any
storage; SQL backends store docs as JSONB/JSON1, never relational tables. Aggregations, `$regex`,
`$elemMatch`, array update operators and text search are explicitly out — those live behind
per-backend escape hatches, uncached.

## Find options

```ts
await service.find({
  query: { status: "active" },
  project: { name: 1, "profile.plan": 1 }, // or exclude: { email: 0 }
  sort: { "meta.created_at": -1 },
  collation: { locale: "en", strength: 2 }, // case-insensitive ordering
  hint: "users_email_idx",
  limit: 20,
  skip: 0,
});
```

- **`project`** — Mongo-shaped: `1` includes, `0` excludes, dot-paths reach into sub-documents.
  Include and exclude cannot be mixed (throws), except `id`, which rides along with an include
  projection unless you opt out with `{ id: 0 }`. The older `select: ["name"]` spelling still works
  as an include projection and is deprecated. **Projected results are never prefetched into the
  by-id cache** — a partial document must not be served to a later `get()`; the result set itself is
  still cached, keyed on the projection.
- **`sort`** — field (or dot-path) → `1` / `-1`.
- **`collation`** — `{ locale, strength }`. Strength `1`/`2` are the case-insensitive levels.
- **`hint`** — an index name (or a key pattern on Mongo). Advisory.

Support differs per backend and is advertised, not guessed — `service.findCapabilities` returns
`native` (passed to storage), `approximate` (honored, but implemented above storage or as a
documented subset) or `none` (accepted and ignored) per option:

| Option      | mongo  | pg                                    | sqlite                         | redis                                   |
| ----------- | ------ | ------------------------------------- | ------------------------------ | --------------------------------------- |
| `project`   | native | approximate (applied to fetched rows) | approximate (fetched rows)     | approximate (fetched documents)         |
| `sort`      | native | native                                | native                         | approximate (in process; id order free) |
| `collation` | native | approximate (`lower()`, text compare) | approximate (`COLLATE NOCASE`) | approximate (case folding in process)   |
| `hint`      | native | **none** (Postgres has no query hint) | native (`INDEXED BY`)          | **none** (no query planner to hint)     |

Under a collation the SQL backends compare values as **text** (that is what folding case means
there), so a collated sort on a numeric field orders lexicographically. SQLite's `NOCASE` folds
ASCII only, and its `INDEXED BY` is a constraint rather than advice — an unknown or unusable index
is an error, and a key-pattern hint is refused.

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
