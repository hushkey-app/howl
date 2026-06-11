# @hushkey/mongo-service

MongoDB backend for the hushkey document-store service layer. The contract — validation, locking,
soft delete, versioned caching, timeouts, telemetry — lives in
[`@hushkey/service-core`](../service-core/README.md)'s `DocumentService`; this package supplies the
storage:

- **`MongoBackend`** — implements `StorageBackend`: `_id: ObjectId` ↔ string `id` mapping (the
  driver type never leaks), neutral-filter `id` → `_id` conversion, index management, collection
  ops.
- **`MongoService`** — `DocumentService` wired to `MongoBackend`, plus the two Mongo-only
  capabilities: `transaction()` (ClientSession, callback may retry — keep side effects idempotent)
  and the `.mongo()` escape hatch (raw `Collection`, bypasses the contract, permanently
  backend-specific).

The full `@hushkey/service-core` surface is re-exported — one import covers the service, filter
grammar, schemas, and adapters.

## Usage

```ts
import { documentSchema, MongoService, RedisCacheAdapter } from "@hushkey/mongo-service";
import { z } from "zod";

const userSchema = documentSchema({
  email: z.string().email(),
  name: z.string(),
});

const users = new MongoService(db, userSchema, {
  collectionName: "users",
  uniqueFields: ["email"],
  cache: { enabled: true, adapter: new RedisCacheAdapter(redis, "users") },
});

const user = await users.create({ email: "a@b.com", name: "Ada" });
await users.patch(user.id, { name: "Ada L." });
```

## Conformance

`tests/conformance.test.ts` runs the core conformance suite against an in-memory fake on every test
run, and against real MongoDB when `MONGO_URL` is set:

```sh
docker run -d --name howl-conf-mongo -p 27117:27017 mongo:7
MONGO_URL=mongodb://localhost:27117 deno task test:services
```

## Migrating from the embedded app class

- `PublicFilter<T>` → `Filter<T>` (the neutral grammar). Mongo-only operators (`$regex`,
  `$elemMatch`, …) move behind `.mongo()`.
- `BaseService` is gone — it stays app-side.
- The schema parameter is structural (`SchemaLike`); existing zod object schemas pass unchanged.
- `session` options are typed `unknown` in shared methods; pass a `ClientSession` as before.

## Peers

- **mongodb** `^6` — peer; `Filter`/`ClientSession` types shift between majors.
- **zod** `^4` — write-boundary validation via the core meta schema.

> `deno doc --lint` note: the only accepted warnings are `private-type-ref` on mongodb driver types
> (`Db`, `Collection`, `ClientSession`) at the constructor/escape-hatch/transaction boundary — the
> honest driver edge — plus the zod refs inherited from core's schema helpers.
