# @hushkey/sqlite-service

SQLite backend for the hushkey document-store service layer — the **zero-infra rung** of the storage
ladder, built for Deno's native `node:sqlite`. No dependencies, no WASM, no server, and it works
under `deno compile`: a full-stack app with embedded storage ships as a single binary.

The contract — validation, locking, soft delete, versioned caching, timeouts, telemetry — lives in
[`@hushkey/service-core`](../service-core/README.md)'s `DocumentService`. A service written against
SQLite moves to [`@hushkey/pg-service`](../pg-service/README.md) or
[`@hushkey/mongo-service`](../mongo-service/README.md) unchanged — that's the ladder.

## Storage layout

Same hybrid as the Postgres backend, in SQLite dialect:

```sql
CREATE TABLE "users" (
  id   TEXT PRIMARY KEY,
  doc  TEXT NOT NULL CHECK (json_valid(doc)),
  "version"    INTEGER GENERATED ALWAYS AS (doc->>'$.version') VIRTUAL,
  "deleted_at" INTEGER GENERATED ALWAYS AS (doc->>'$.meta.deleted_at') VIRTUAL
  -- + one generated column per `promote` entry
);
```

- `ALTER TABLE` can only add **VIRTUAL** generated columns (not STORED) — fine: virtual columns are
  indexable, which is all the promote mechanism needs.
- `deleted_at` gets a partial index (`WHERE deleted_at IS NULL`); `uniqueFields` get unique indexes.
  No migration framework — only the `promote` list changes DDL, ensured idempotently at construction
  (duplicate-column errors are the idempotency signal). Removing a path is additive-only, so it
  leaves an _orphan_ column behind; the backend implements the optional `SchemaAdmin` capability
  (`listColumns` / `dropColumn`) to introspect and clean those up — surfaced in
  [`@hushkey/studio`](../studio/README.md)'s schema view. SQLite refuses to drop an indexed column,
  so the convention-named indexes are dropped first; declared columns are refused, and document data
  (in `doc`) is never touched.
- The filter compiler is simpler than Postgres's in two ways: `->>` returns **natively-typed**
  values (numeric comparisons without casts), and SQLite maps both JSON null and absent keys to SQL
  NULL — which is exactly Mongo's null-equality semantics. Key presence (`$exists`) is asked via
  `json_type()`.
- `updatePaths` is one atomic `UPDATE … RETURNING`: non-null paths merge via `json_patch()` (RFC
  7386 creates missing parents), null paths chain as explicit `json_set(…, null)` — RFC 7386 treats
  null as key _removal_, and the meta contract stores nulls.

## Usage

```ts
import { DatabaseSync } from "node:sqlite";
import { documentSchema, SqliteService } from "@hushkey/sqlite-service";
import { z } from "zod";

const db = new DatabaseSync("./data/app.db"); // or ":memory:"

const users = new SqliteService(db, documentSchema({ email: z.string(), name: z.string() }), {
  collectionName: "users",
  uniqueFields: ["email"],
});

const user = await users.create({ email: "a@b.com", name: "Ada" });
await users.patch(user.id, { name: "Ada L." });
```

The handle is duck-typed (`prepare`/`exec`) — better-sqlite3 satisfies it on Node.

## Caveats, honestly

- **Single-writer, per-process.** WAL mode is enabled best-effort. This is the dev / small-app /
  edge rung; moving up the ladder is what the shared contract is for.
- Caching is rarely worth enabling — reads are local microseconds. If you do pair a shared adapter,
  the namespace is `"sqlite"` (`RedisCacheAdapter(redis, "users", "sqlite")`); the core service
  throws at construction on a prefix mismatch.
- `$in`/`$nin` accept scalars only; whole-object equality compares minified JSON representations
  (key-order-sensitive, like Mongo).

## Conformance

`tests/conformance.test.ts` runs the core conformance suite against a fresh in-memory `DatabaseSync`
per test, on every `deno task test:services` run — real native SQLite, no infra, fastest suite of
the three backends.

## Out of scope

`$regex`, `$elemMatch`, aggregations, joins, text search. The grammar is
`$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists` + dot-paths; anything richer goes through the
`.sqlite()` escape hatch, explicitly uncached.

> `deno doc --lint` note: the only accepted warnings are `private-type-ref` on zod types inherited
> from core's `metaSchema`/`documentSchema` re-export.
