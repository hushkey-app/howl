# Service Layer — Handoff (2026-06-11)

Context for rebuilding this package as standalone JSR packages under the `@hushkey` scope. Written
after a full audit + bugfix pass (2026-06-10) and a prod staleness investigation. Self-sufficient:
everything needed to rebuild without the original conversation is in here.

---

## 1. What this folder is

A generic MongoDB service layer. One class per collection, instantiated with a zod schema + options.
Used by ~15 services in `packages/services/*` and every API handler in `apps/web/server` (via the
`service()` registry in `packages/services/_index.services.ts`).

| File                         | Role                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `mongo.service.class.ts`     | The core. CRUD + cache + telemetry + soft-delete + optimistic locking                               |
| `cache.interface.ts`         | `CacheAdapter` + `CacheOptions` interfaces                                                          |
| `in-memory-cache.adapter.ts` | LRU + TTL fallback adapter (default when cache enabled, no adapter given)                           |
| `redis-cache.adapter.ts`     | Production adapter; owns the shared collection-version key                                          |
| `telemetry.interface.ts`     | `TelemetryAdapter` interface                                                                        |
| `opentelemetry.adapter.ts`   | Reference OTel adapter (currently unused by any caller)                                             |
| `base.service.class.ts`      | Thin zod-validator base for non-Mongo services (mapbox, payments, caches). Weak — candidate to drop |

**Dependency posture (the good news):** the import graph is only `mongodb`, `zod`, and local files.
The Redis adapter does NOT import ioredis (`redis: any`, duck-typed — needs
`get/set/del/mget/scan/incr`). The OTel adapter does NOT import an OTel SDK (`span: any`). Zero
`@packages/*` imports. Extraction is dependency-clean today.

---

## 2. The contract (conventions baked into the class)

These ARE the product. Preserve them exactly or migrate every consumer.

- **String ids only.** `_id: ObjectId` never leaks. `normalize()` strips `_id`, derives `id` string.
  Stored docs have no `id` field; it exists only in validated/returned shapes. Queries accept `id`
  (string or operator object); `normalizeQueryIds()` converts to `_id` ObjectId, recursing into
  `$or/$and/$nor`.
- **Meta block** stamped on create, schema-validated everywhere:
  `meta: { created_at, created_by, updated_at, updated_by, deleted_at, deleted_by }` (epoch ms;
  `deleted_*` null when active). The zod fragment consumers use is
  `packages/shared/schemas/meta.extension.schema.ts` — it must SHIP WITH the extracted package or
  the contract is split in two repos.
- **Soft delete by default.** Every read filters `meta.deleted_at: null` unless `viewDeleted: true`.
  `delete()` defaults soft; `{ hard: true }` for real delete. `restore()` un-deletes.
- **Optimistic locking.** `version: int` on every doc, `$inc`'d on patch/restore. Caller MAY pass
  `version` in patch args → becomes a filter (`expected version` mismatch throws). Without it,
  last-writer-wins per FIELD (see patch semantics below).
- **`executionerId`** on every write option → `meta.*_by` audit fields. Defaults `'system'`.
- **Zod validation at write boundaries.** Full merged doc is parsed on create/patch. zod
  default-strips unknown keys — fields not in schema are silently dropped on write.
- **patch() semantics (changed 2026-06-10 — important):**
  - deep-merges args into existing doc (objects merge, **arrays replace**)
  - validates the FULL merged doc against the schema
  - but `$set`s ONLY the dotted paths present in the caller's args (plus
    `meta.updated_at/updated_by`), values taken from the validated merged doc. This prevents the
    lost-update bug where the full-doc `$set` reverted concurrent writes to unrelated fields. DO NOT
    regress to full-doc `$set`.
  - `flattenObject` treats arrays as leaves and DROPS empty objects (`{a:{}}` flattens to nothing) —
    long-standing behavior, consumers tolerate it.
- **get() is id-only** (changed 2026-06-10). The old `idOrEmail` heuristic (`includes('@')`) is
  gone. Email lookup lives app-side: `usersService.getByEmail()` (goes through `find()` →
  soft-delete filter + cached). Callers migrated: magic-link generate, passkeys authenticate begin.
- **`mget(ids)`** batch get: cache `mget` → single Mongo `$in` for misses → stitch in input order,
  nulls for not-found.
- **Timeouts:** every Mongo op raced against `queryTimeout` (default 30s). Note the underlying op is
  NOT aborted on timeout, only abandoned.
- **`transaction(cb)`**: `withTransaction` on `db.client` — RETRIES the callback on transient
  errors; side effects in callbacks must be idempotent. Requires replica set. Invalidates this
  service's cache after commit (only this service's — patches on OTHER services inside the callback
  bump their own versions at patch time, i.e. BEFORE commit; see Known Issues #2).
- **Escape hatch:** `.mongo()` returns the raw `Collection<T>`. Call sites using it are permanently
  backend-specific.

### Cache design (versioned invalidation)

- Key formats:
  - get: `mongo:<collection>:v<version>:get:<id>`
  - find: `mongo:<collection>:v<version>:find:<hash>` — hash = DJB2-XOR + FNV-1a over the key-sorted
    JSON of `{query, limit, skip, sort, select}` (dual 32-bit, widened 2026-06-10; do not shrink
    back to single 32-bit)
  - version key (Redis adapter owns it): `mongo:<collection>:version`
- **Any write bumps the collection version** → all old keys orphaned (expire by TTL). There is NO
  per-key invalidation. Write-heavy collections get ~0% hit rate by design.
- `RedisCacheAdapter` caches the version in-process for **1s** (`VERSION_CACHE_TTL_MS`) to avoid a
  Redis GET per read. This is the source of the read-your-writes race (Known Issues #1).
- patch() re-caches the updated doc under the NEW version key after bumping.
- find() prefetches up to 50 result docs into the get-cache (concurrency 20, fire-and-forget).
- Caching skipped when `viewDeleted` or a `session` is active.
- In-memory fallback path: per-process `collectionVersion++` — correct single-process only.
- `RedisCacheAdapter` constructor: `(redis, collectionName, keyPrefix = 'mongo')`. `keyPrefix`
  scopes the version key and the patternless `clear()` (`<prefix>:*` via SCAN — never `KEYS *`; the
  Redis is shared with queues/sessions). Must match the prefix the service class writes (hardcoded
  `mongo:` in `generateCacheKey` — intrinsic to MongoService; a future SqlService writes `sql:` and
  passes `'sql'`).

---

## 3. Fixes applied 2026-06-10 (don't regress these)

1. `delete()` normalizes results (was returning raw driver docs — leaked ObjectId `_id`, no string
   `id`).
2. `get()`/`find()` end their telemetry span on cache hits (was leaking a span per hit — the hottest
   path).
3. patch() `$set` narrowed to patched paths only (lost-update fix, see above).
4. `ensureUniqueFields` catches per-field `createIndex` failures — constructor fires it un-awaited;
   an uncaught rejection kills the Deno process at startup.
5. `get(idOrEmail)` → `get(id)`; `getByEmail` added to users service.
6. `create()` returns normalized insert payload directly (removed redundant post-insert `findOne`
   round trip).
7. Cache hash widened to dual 32-bit.
8. `transaction()` doc-warns about callback retries.
9. `RedisCacheAdapter`: patternless `clear()` scoped to namespace (was `KEYS('*')` + DEL = flushed
   the whole shared Redis DB); `keyPrefix` param.
10. `InMemoryLRUCache.clear(pattern)` escapes regex metacharacters.
11. OTel adapter: `db.system`/span prefix configurable via constructor (`dbSystem = 'mongodb'`);
    removed fossil `postgres.*` labels and the nonexistent `Deno.tracer` API.
12. `BaseService.validate` actually throws on invalid and returns `.data` (was returning the
    SafeParse wrapper cast to `T`).
13. Dead code removed: `convertQueryStringsToObjectId`, `findArgs` type.

---

## 4. Known issues / open bugs (carry into the rebuild)

1. **Read-your-writes race (PROD INCIDENT 2026-06-10).** Replica A patches a user → INCRs version
   v5→v6. Replica B is inside its 1s in-process version window → still builds v5 keys → the OLD
   `mongo:users:v5:get:<id>` entry is still in Redis (TTL 7d for users) → **hit, stale doc served**.
   Client (`store.updateContext()` fired immediately after a mutation POST) pins the stale context,
   making a 1s server race look permanent. Symptom reported as "LRU did not flush for that user".
   **Designed fix:** on patch/delete/restore, after the version bump, also `cacheAdapter.delete()`
   the OLD-version `get:` key for that id (pre-bump version is known at that point). Lagging
   replicas then miss → read Mongo → fresh. NOT YET IMPLEMENTED — first thing to do in the rebuild.
2. **Cache-bump failure fails the write after it persisted.** `invalidateCache()` →
   `incrementVersion()` has no try/catch; a Redis blip at write time throws AFTER `findOneAndUpdate`
   succeeded → caller sees an error for a write that happened, and the version never bumps (stale
   cache until TTL). Decide policy: swallow + log (cache may serve stale until next successful bump)
   vs current fail-loud. Related: inside `transaction()`, other services' version bumps happen at
   patch time (pre-commit), so a read between bump and commit can re-cache the PRE-commit doc under
   the NEW version key. With users TTL=7d that's a week of stale. The old-version-key delete (fix
   #1) does not solve this one; consider bumping versions only post-commit for session-scoped
   writes.
3. **`mget()` builds cache keys outside any try/catch** — a `getVersion()` throw fails the whole
   mget instead of degrading to a DB read (get/find degrade correctly).
4. **Zero tests.** patch path-narrowing, version invalidation, mget stitching, soft-delete filters —
   none covered. The app's API tests catch regressions indirectly. A published package needs its own
   suite (see §5 conformance).
5. `InMemoryLRUCache` eviction is O(n) scan; fine at maxSize 1000, fix if raised.
6. `withDeletedFilter` injects `meta.deleted_at: null` into every `$and` branch (redundant but
   harmless); clobbers any caller-supplied top-level `meta.deleted_at` condition unless
   `viewDeleted` is set.
7. **Related, in the Howl repo** (`~/Private/typescript/howl`, `packages/howl/api/cache/tiered.ts`):
   `tryCache.get` falls back to the memory tier on primary **miss**, not just primary error/timeout.
   Response `set()` writes BOTH tiers, so after a Redis delete/expiry the stale per-instance memory
   copy is resurrected; deletes never reach other instances' memory tiers at all. Affects any
   `caching.ttl > 0` endpoint (today: availability endpoints, ttl 60). Fix in Howl: fallback only on
   primary error/timeout, never on miss.

---

## 5. Rebuild target (agreed direction)

JSR scope `@hushkey`, framework-independent (zero Howl coupling — keep it that way):

```
@hushkey/service-core      ← the contract: filter grammar, CacheAdapter /
                              TelemetryAdapter interfaces, Meta type + meta zod
                              fragment, CreateArgs/PublicDocument types,
                              cache-version orchestration, validation, locking,
                              audit stamping, timeout wrapper
@hushkey/mongo-service     ← thin backend: filter passthrough + collection ops
@hushkey/pg-service        ← thin backend: filter→JSONB compiler (later)
@hushkey/sqlite-service    ← thin backend: JSON1 (later)
```

**Positioning: "Mongo-shaped document store", NOT "Mongo-compatible".** Document-store semantics
over any storage; SQL backends store docs as JSONB/JSON1, not relational tables. The pitch is the
storage ladder: start on SQLite (zero infra), swap to Postgres or Atlas without rewriting a service.
Never promise Mongo compatibility (aggregations, $regex, $elemMatch, array update operators, text
search are OUT — that treadmill is FerretDB's whole company).

**Decisions already made:**

- **Own filter grammar**, the empirically-used subset:
  `$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists` + dot-paths. Mongo backend passes through;
  SQL backends compile. The current `PublicFilter<T>` (Mongo's `Filter` re-skinned) is the only real
  Mongo coupling in the types — replace it with the neutral grammar in core.
- **Backend contract** (everything interesting stays in core):
  `insertOne / findOne / findMany / count / updatePaths(id, paths, expectedVersion?) / deleteOne`.
- **Relations: integrity yes, navigation no.** Declarative FK option alongside
  `uniqueFields`/`indexes` (`references: [{ field, table }]`) — SQL backends enforce, Mongo no-ops.
  NO join/populate API ever: it breaks the per-collection version cache, can't be honored by the
  Mongo backend, and is the ORM slope. Joins live behind per-backend escape hatches (`.mongo()`,
  `.sql()`), explicitly uncached.
- **Conformance test suite in core**, run by every backend against real storage (testcontainer Mongo
  / pg / sqlite file). The contract package IS the product; this is how a third-party
  `mysql-service` stays honest.
- **Zod coupling:** loosen the constructor to a structural interface
  (`{ safeParseAsync(d): Promise<{success, data?, error?}> }`) or pin the zod major as a documented
  peer. Zod majors have incompatible types; do not let this surprise consumers.
- **mongodb driver = peer dependency**, document the supported major range (`ClientSession`/`Filter`
  types shift between majors).
- **Drop `BaseService`** from the extraction (4 services use it as a marker; fix them app-side). The
  `service()` registry also stays app-side — it's app composition.
- Keep interfaces in dedicated subpath modules (`/cache`, `/telemetry`, `/adapters/redis`) so they
  can graduate to core cleanly. `InMemoryLRUCache` is the default fallback, not a headline feature.
  Document the duck-typed Redis client shape instead of depending on ioredis.
- JSR `no-slow-types` will demand explicit return types — the current code is mostly fine but audit
  the `any`s.
- A Postgres version of this layer existed before (the OTel adapter's `postgres.*` labels were its
  fossil). If that code survives anywhere, diff its public surface against this class before
  finalizing core — the intersection is the empirically-portable API.

**Sequencing:** core + mongo backend + conformance suite first, with fix #1 (old-version-key delete)
and the policy decision on #2 designed in from the start. Hushkey app migrates as the first consumer
(15 services + registry — mostly mechanical: imports + the `PublicFilter` → grammar type swap). SQL
backends after the contract has been stable in prod for a few weeks.

---

## 6. pg-service storage design (decided 2026-06-11)

**Hybrid: one JSONB doc + promoted columns. NOT FerretDB-style pure-generic JSONB, NOT
column-per-field.**

- Fixed table shape: `id TEXT PK, doc JSONB, version BIGINT` + promoted columns. Because the shape
  is fixed, schema changes need NO migration framework — only the `promote` list changes DDL, and
  that's a mechanical `ALTER TABLE ADD COLUMN ... GENERATED ALWAYS AS (doc->>'…') STORED` diffed
  from config (`ensureTable()`, same idiom as `ensureIndexes`).
- `promote: ['organisation_id', 'status', …]` per collection → real typed generated columns, B-tree
  indexed, real planner statistics. `meta.deleted_at`
  - `version` always promoted implicitly; `deleted_at` gets a partial index
    (`WHERE deleted_at IS NULL`). `uniqueFields` → unique column constraints. Filter compiler routes
    promoted predicates to columns, the rest to JSONB ops.
- Why not pure JSONB: GIN can't do range queries or sorts, Postgres keeps no per-path statistics
  (bad plans), and FerretDB only lives with that because the Mongo wire protocol forbids schema
  knowledge — we have zod, we can promote. (FerretDB v2 abandoned plain JSONB for a storage
  extension; skip that arc.)
- JSONB perf honesty: point reads ≈ native; equality via GIN fine; writes rewrite the whole row
  (MVCC) and docs >~2KB TOAST — negligible at low-KB doc sizes, watch it for big frequently-patched
  docs.
- **Zero dependencies:** duck-type the driver like the Redis adapter —
  `{ query(text, params): Promise<{ rows }> }` — works with pg, postgres.js, Neon. No Kysely (the
  compiled filter grammar emits parametrized SQL directly; it's less code than query-builder
  branching). No Prisma (fixed table shape removed the need).
- Same design ports to sqlite-service: JSON1 + generated columns (SQLite ≥3.31).

### Lessons from the 2025 Postgres ancestor (Kysely+Prisma era, "momore")

The old `PostgresService` mapped top-level zod fields to real columns → every schema change was DDL
→ needed Prisma migrations + a zod→Prisma generator + Kysely for dynamic columns. The stack collapse
("too much") was caused by the storage layout, not by SQL itself. Specific carryovers:

- KEEP: `->>'` (text) for `like`, `->` (typed) otherwise; cast for JSONB-path ordering
  (`(col->>'k')::bigint`); the raw-SQL escape hatch concept.
- FIX: its `deepMergePatch` skipped `null` source values — fields could never be cleared via patch.
  Core contract: `undefined` = skip, `null` = clear.
- DROP: the `sql` template's FROM-substring table guard (breaks on lowercase `from`/joins; safety
  theater). Escape hatches are honest or absent.
- It also had: the `idOrEmail` heuristic (where the Mongo class inherited it), full-row `.set()` on
  patch (lost-update), unindexable `jsonb_typeof(meta->'deleted_at')='null'` soft-delete filter,
  zod-internals introspection in `normalize` (`field.def.type` — version-brittle; supports the
  structural-schema-interface decision in §5). All superseded.

---

## 7. Relational sibling (optional, separate product)

If/when relations are wanted: NOT in pg-service (document contract). A sibling
`@hushkey/sql-service` designed for relations from day one:

- **Composite version keys** make the versioned cache survive joins: declared relations ⇒
  touched-table set is static ⇒ cache key includes every touched table's version
  (`sql:bookings:v12+orgs:v5:find:<hash>`). Write to orgs bumps orgs version ⇒ all joined reads
  miss. O(1) invalidation preserved. This only works because the relation graph is declared and
  closed.
- Declared `belongsTo`/`hasMany` in config; eager `include` only (depth 1 in v1); NO lazy loading,
  NO nested writes, NO arbitrary join graphs, no filter-through-relation in v1. Writes stay
  per-entity; transactions compose.
- FK integrity from declarations; included children always filter `deleted_at IS NULL`; no implicit
  soft-cascade.
- Typed `include` (`Booking & { org: Organisation }`) is the main engineering cost. Owning a
  DDL/migrations story is the main hidden cost.
- Shares adapters/meta/conventions with core but NOT the storage-swap promise. Moving
  document⇄relational is a migration; docs must say so.

---

## 8. Current consumers (migration checklist)

- `packages/services/*` — 10 collection services with Redis adapter (availability_rules, bookings,
  wishlists, organisations, properties, mfa, users, compliance_documents, jobs,
  passkey_credentials) + several uncached (publisher_applications, settings, tokens, …). 4 services
  extend `BaseService` (mapbox, dodo-payments, properties-cache, caches).
- `packages/services/_index.services.ts` — typed registry, preserves subclass methods (e.g.
  `users.getByEmail`).
- `apps/web/server` — every API handler; middleware (`auth.middleware` per-request user map →
  `usersService.get/mget`; `set-organisation-context` → org find/get).
- `apps/processor` — jobs import services for scheduled work.
- Direct `.mongo()` escape-hatch call sites: grep before migrating; they pin the Mongo backend.
- Notable app-side cache configs: users TTL = 7 days (long! interacts with Known Issues #1/#2), most
  others default 300s.
