# @hushkey/redis-service

The Redis backend for the [`@hushkey/service-core`](../service-core/README.md) document-store
contract — **Redis as the database**, not a cache in front of one.

Same contract as the other backends (string ids, the audit/soft-delete envelope, optimistic locking,
soft delete by default, the neutral filter grammar), so a service written against Redis moves to
Postgres or Mongo unchanged. Every backend runs the same conformance suite; this one runs it against
an in-memory double **and** a real server.

```ts
import { RedisService } from "@hushkey/redis-service";

// Any client works — the backend needs one `sendCommand(args)` method.
const client = { sendCommand: (args: (string | number)[]) => redis.call(...args.map(String)) };

export class SessionsService extends RedisService<Session> {
  constructor() {
    super(client, sessionsSchema, {
      collectionName: "sessions",
      index: ["user_id", { path: "expires_at", kind: "number" }],
    });
  }
}
```

## Don't cache it

Leave the service cache off (the default). Reads here are a memory lookup one hop away — a cache in
front of Redis buys nothing and adds an invalidation surface. `cachePrefix` is still `redis` for the
rare case you deliberately put a local LRU in front of a remote one.

## Storage layout

Plain Redis 6.2+ — **no modules** (no RedisJSON, no RediSearch). Valkey, Dragonfly and Upstash work
too.

| Key                         | Type   | Holds                                                 |
| --------------------------- | ------ | ----------------------------------------------------- |
| `{howl:blogs}:d:<id>`       | string | The document, as JSON                                 |
| `{howl:blogs}:ids`          | zset   | Every id, score 0 → lexicographic (uuidv7 = by time)  |
| `{howl:blogs}:active`       | zset   | Ids whose `meta.deleted_at` is null                   |
| `{howl:blogs}:t:<path>:<v>` | set    | Ids carrying value `v` at a declared `tag` path       |
| `{howl:blogs}:n:<path>`     | zset   | Ids scored by their value at a declared `number` path |

Every key of a collection shares one hash tag, so a collection lives in a single Redis Cluster slot
and multi-key commands stay legal.

## How a query runs

`index` is the Redis counterpart of the SQL backends' `promote`: declared paths get a physical
index, and the planner compiles the filter into set operations Redis runs itself.

| Filter                             | Redis                                            |
| ---------------------------------- | ------------------------------------------------ |
| `{}` / soft-delete only, paged     | `ZRANGE … BYLEX LIMIT` — one page, nothing else  |
| `count()` unfiltered               | `ZCARD` — no documents leave Redis               |
| `{ status: "live" }` (tag)         | `ZINTER active t:status:"live"`                  |
| `{ status: { $in: [...] } }`       | `SUNION` of the value sets                       |
| `{ likes: { $gte: 10 } }` (number) | `ZRANGEBYSCORE`, then `ZMSCORE` against the base |
| `$or` of tag equalities            | one `SUNION`                                     |
| anything else                      | scan the base set, filter in process             |

**Every query is correct; the index list only decides how much work Redis does.** A condition an
index cannot answer _soundly_ — a null equality (which must also match absent keys), `$ne`/`$nin`,
`$exists`, an undeclared path, structural equality on an object — narrows nothing and is re-checked
against the fetched candidates with the same semantics the SQL backends compile into SQL. An index
source may over-select; it may never miss a match.

Projection, sorting and collation are applied to the fetched candidates (Redis stores opaque JSON),
and Redis has no query planner to hint — `findCapabilities` reports
`project: approximate, sort: approximate, collation: approximate, hint: none`. The exception is the
id order the base zset already holds: an unsorted or id-sorted page is served straight out of Redis.

## Writes

Every write is one round trip: a compare-and-set Lua script that guards on the **exact previous
document bytes**, then applies the document and its index changes together.

- No `WATCH`, no client-side transaction to unwind.
- A document and its index entries can never diverge — they move in the same script.
- Optimistic locking (`version`) is enforced server-side; a lost race re-reads and re-applies
  (bounded by `maxRetries`, default 3) instead of clobbering the other writer.
- Empty index keys disappear on their own — Redis drops a set when its last member goes.

## Options

| Option           | Default | Meaning                                                        |
| ---------------- | ------- | -------------------------------------------------------------- |
| `collectionName` | —       | The collection (one key namespace)                             |
| `keyPrefix`      | `howl`  | Namespaces the app inside the Redis database                   |
| `index`          | `[]`    | Paths to index: `"status"` (tag) or `{ path, kind: "number" }` |
| `maxRetries`     | `3`     | Compare-and-set retries before giving up on a contended write  |

## Clients

The backend depends on no driver — it needs one method:

```ts
interface RedisClientLike {
  sendCommand(args: (string | number)[]): Promise<unknown>;
}
```

```ts
// ioredis
const client = { sendCommand: (a) => redis.call(...a.map(String)) };
// node-redis v4
const client = { sendCommand: (a) => node.sendCommand(a.map(String)) };
// jsr:@db/redis
const client = { sendCommand: ([cmd, ...rest]) => conn.sendCommand(String(cmd), rest) };
```

`tests/_resp_client.ts` implements the whole surface over a raw socket in ~100 lines, if you want a
dependency-free option to copy.

## Tests

```
deno task test:services                                  # in-memory double, no infra
REDIS_URL=redis://127.0.0.1:6379 deno task test:services # + the real server (and the Lua)
```

The suite runs the conformance cases three ways: against the double with indexes declared, against
the double with **none** declared (proving the scan path answers everything the planned path does),
and against a real Redis.
