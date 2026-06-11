# _db — three domains, three databases

A Howl backend wiring the `@hushkey` service layer the way a real app does: one folder per domain
entity, schema and service in separate files, each entity on its **own database connection**
([server/services/connections.ts](server/services/connections.ts)):

```
server/services/
  connections.ts            ← the three database connections
  users/
    users.schema.ts         ← zod documentSchema
    users.service.ts        ← UsersService extends SqliteService  + getByEmail()
  blogs/
    blogs.schema.ts
    blogs.service.ts        ← BlogsService extends PgService      + published(), bySlug()
  reviews/
    reviews.schema.ts
    reviews.service.ts      ← ReviewsService extends MongoService + topForBlog()
```

| Entity    | Database | Connection                                      |
| --------- | -------- | ----------------------------------------------- |
| `users`   | SQLite   | `node:sqlite` file (`data/app.db`) — zero infra |
| `blogs`   | Postgres | `PG_URL` server, or embedded PGlite fallback    |
| `reviews` | MongoDB  | `MONGO_URL` (503 with a hint when unset)        |

Entities reference each other by **string id only** (`blogs.author_id` → SQLite user,
`reviews.blog_id` → Postgres blog) — integrity is checked app-side in the create handlers; the
service layer never joins.

## Run

```sh
deno task dev                       # users + blogs work with zero setup
open http://localhost:3002
```

Optional real servers:

```sh
docker run -d --name howl-conf-mongo -p 27117:27017 mongo:7
docker run -d --name howl-conf-pg -p 54329:5432 \
  -e POSTGRES_PASSWORD=conf -e POSTGRES_DB=howl_conformance postgres:16-alpine

MONGO_URL=mongodb://localhost:27117 \
PG_URL=postgres://postgres:conf@localhost:54329/howl_conformance \
deno task dev
```

## Endpoints

- `POST /api/users/create` · `GET /api/users?role=author&email=…`
- `POST /api/blogs/create` · `GET /api/blogs?published=true&min_likes=10&slug=…`
- `POST /api/reviews/create` · `GET /api/reviews?blog_id=…&min_rating=4`
- `GET /api/demo/flow` — one transcript across all three databases: SQLite author → Postgres blogs
  (promoted-column `$gte`, optimistic-lock rejection, soft delete/restore) → MongoDB reviews
  (`topForBlog`). Idempotent.

Create/list handlers show the `defineApi` idioms: `requestBody` → typed `ctx.req.body`, `query` →
typed `ctx.query()`, pass-through responses (`{ status, data }`).
