# _db — three domains, three databases

A full-stack Howl app: the `@hushkey` service layer wired the way a real app does it, plus an
**interactive Vue console** on top — a dark instrument panel with one color-coded panel per database
(create forms, filtered lists, like/optimistic-lock buttons, soft delete/restore, and a RUN FLOW
transcript across all three databases). The whole page is a `.vue` file SSR'd by the Vue engine and
hydrated into a live SPA; all data is fetched client-side from the APIs.

One folder per domain entity, schema and service in separate files, each entity on its **own
database connection** ([server/services/connections.ts](server/services/connections.ts)):

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

| Entity    | Database | Connection                                                                                          |
| --------- | -------- | --------------------------------------------------------------------------------------------------- |
| `users`   | SQLite   | `node:sqlite` file (`data/app.db`) — zero infra                                                     |
| `blogs`   | Postgres | `PG_URL` server, or embedded PGlite fallback                                                        |
| `reviews` | MongoDB  | `mongodb://localhost:27017` by default (`MONGO_URL` overrides); panel goes OFFLINE when unreachable |

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
# mongo — picked up automatically on the default port, no env var needed
docker run -d --name howl-mongo -p 27017:27017 mongo:7

# postgres — opt in via PG_URL (PGlite is the default otherwise)
docker run -d --name howl-conf-pg -p 54329:5432 \
  -e POSTGRES_PASSWORD=conf -e POSTGRES_DB=howl_conformance postgres:16-alpine
PG_URL=postgres://postgres:conf@localhost:54329/howl_conformance deno task dev
```

## Endpoints

- `POST /api/users/create` · `GET /api/users?role=author&email=…`
- `POST /api/blogs/create` · `GET /api/blogs?published=true&min_likes=10&slug=…`
- `POST /api/reviews/create` · `GET /api/reviews?blog_id=…&min_rating=4`
- `GET /api/demo/flow` — one transcript across all three databases: SQLite author → Postgres blogs
  (promoted-column `$gte`, optimistic-lock rejection, soft delete/restore) → MongoDB reviews
  (`topForBlog`). Idempotent.

- `POST /api/blogs/like` (`{ id, stale? }` — `stale: true` sends a wrong expected version so the
  optimistic lock rejects with 409; the UI flashes the row), `POST /api/blogs/delete` (soft),
  `POST /api/blogs/restore`.

Create/list handlers show the `defineApi` idioms: `requestBody` → typed `ctx.req.body`, `query` →
typed `ctx.query()`, pass-through responses (`{ status, data }`).

## UI

[client/pages/index.vue](client/pages/index.vue) — Vue 3 SFC, Tailwind v4 + daisyUI custom theme
(`static/style.css`), Chakra Petch + JetBrains Mono. Click a user row to select the blog author
(cross-database reference); the reviews panel shows an OFFLINE state with setup instructions when
`MONGO_URL` is unset.
