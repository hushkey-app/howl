# @hushkey/pg-service

Postgres backend for the hushkey document-store service layer. The contract — validation, locking,
soft delete, versioned caching, timeouts, telemetry — lives in
[`@hushkey/service-core`](../service-core/README.md)'s `DocumentService`; this package supplies the
storage.

## Storage layout (hybrid)

One JSONB document per row plus **typed generated columns** for promoted paths — not pure-generic
JSONB (no per-path planner statistics, no range indexes), not column-per-field (every schema change
becomes DDL):

```sql
CREATE TABLE "users" (
  id   TEXT PRIMARY KEY,
  doc  JSONB NOT NULL,
  version    BIGINT GENERATED ALWAYS AS (((doc #>> '{version}'))::bigint) STORED,
  deleted_at BIGINT GENERATED ALWAYS AS (((doc #>> '{meta,deleted_at}'))::bigint) STORED
  -- + one generated column per `promote` entry
);
```

- `version` and `meta.deleted_at` are always promoted; `deleted_at` gets a partial index
  (`WHERE deleted_at IS NULL`) so the soft-delete filter every read carries is index-backed.
- `promote: ["organisation_id", { path: "score", type: "numeric" }]` → real B-tree-indexed columns
  with real planner statistics. `uniqueFields` → unique generated columns.
- **No migration framework.** The table shape is fixed; only the `promote` list changes DDL, and
  `ensureTable()` applies it idempotently at construction (`ADD COLUMN IF NOT EXISTS …`). Because
  this is additive-only, **removing** a path from `promote` leaves the column + index physically
  present (an _orphan_ — maintained on every write, no longer queried). The backend implements the
  optional `SchemaAdmin` capability (`listColumns` / `dropColumn`) to introspect and drop those
  orphans — surfaced in [`@hushkey/studio`](../studio/README.md)'s schema view. A single
  `DROP COLUMN` suffices (Postgres cascades the index); declared columns are refused, and document
  data is never touched (it lives in `doc`).
- The filter compiler routes promoted predicates to columns and everything else to JSONB operators,
  preserving Mongo null semantics (null matches JSON null _and_ absent keys).
- `updatePaths` is a single atomic `UPDATE` via a recursive `howl_jsonb_deep_set` (plain `jsonb_set`
  silently drops paths whose parents are missing).

## Zero dependencies

The driver is duck-typed — `{ query(text, params): Promise<{ rows }> }`:

- **pg** (`Pool`/`Client`) and **Neon serverless** satisfy it directly.
- **postgres.js**: wrap `sql.unsafe` —
  `{ query: (t, p) => sql.unsafe(t, p).then((rows) => ({ rows })) }`.

No Kysely (the compiled filter grammar emits parametrized SQL directly), no Prisma (the fixed table
shape removed the need).

## Usage

```ts
import { documentSchema, PgService } from "@hushkey/pg-service";
import { z } from "zod";

const users = new PgService(pool, documentSchema({ email: z.string(), name: z.string() }), {
  collectionName: "users",
  uniqueFields: ["email"],
  promote: ["name"],
});

const user = await users.create({ email: "a@b.com", name: "Ada" });
await users.patch(user.id, { name: "Ada L." });
```

Pair it with a shared cache via `RedisCacheAdapter(redis, "users", "sql")` — the `"sql"` prefix is
mandatory; the core service throws at construction if the adapter's namespace doesn't match the
backend's `cachePrefix`.

## Transactions

Not wrapped in v1 — Postgres transactions need a dedicated connection, which is a driver concern.
Run `BEGIN`/`COMMIT` on a dedicated client and pass it as `session` to each operation; caching is
automatically skipped for session-scoped reads.

## Conformance

`tests/conformance.test.ts` runs the core conformance suite against [PGlite](https://pglite.dev) —
real Postgres compiled to WASM — on every `deno task test:services` run. No container required;
generated columns, plpgsql, and JSONB behave exactly like a server.

A second, `PG_URL`-gated run targets a real server (via `npm:pg`, test-only):

```sh
docker run -d --name howl-conf-pg -p 54329:5432 \
  -e POSTGRES_PASSWORD=conf -e POSTGRES_DB=howl_conformance postgres:16-alpine
PG_URL=postgres://postgres:conf@localhost:54329/howl_conformance deno task test:services
```

## Out of scope

`$regex`, `$elemMatch`, aggregations, joins, text search. The grammar is
`$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists` + dot-paths; anything richer goes through the
`.sql()` escape hatch, explicitly uncached.

> `deno doc --lint` note: the only accepted warnings are `private-type-ref` on zod types inherited
> from core's `metaSchema`/`documentSchema` re-export.
