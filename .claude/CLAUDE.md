# Howl Framework — Claude Agent Guide

## What this repo is

Howl is a Deno-native, server-first full-stack framework. It powers [Hushkey](https://hushkey.app).
Fresh 2.x is ancestry, not identity — the codebase has diverged substantially. **The core has no
built-in view renderer**: Preact was removed entirely; pages render through pluggable engines
(`@hushkey/howl-vue`, `@hushkey/howl-react`).

Root: `~/Private/typescript/howl/`\
Stack: Deno 2.x · Zod 4 · esbuild 0.25 · engines: Vue 3 / React 18

---

## Workspace map

JSR scope `@hushkey`. Every package lives under `packages/`:

| Package           | JSR name                  | Responsibility                                                         |
| ----------------- | ------------------------- | ---------------------------------------------------------------------- |
| `howl/`           | `@hushkey/howl`           | Core, API layer, dev/build pipeline, plugins (see below)               |
| `howl-vue/`       | `@hushkey/howl-vue`       | Vue SFC engine: compiler, esbuild plugin, runtime, Pinia               |
| `howl-react/`     | `@hushkey/howl-react`     | React engine: `reactEngine`, boot, store, router                       |
| `howl-init/`      | `@hushkey/howl-init`      | Project scaffolder                                                     |
| `service-core/`   | `@hushkey/service-core`   | `DocumentService`, filter grammar, `StorageBackend`, conformance suite |
| `mongo-service/`  | `@hushkey/mongo-service`  | Mongo backend (passes conformance suite)                               |
| `pg-service/`     | `@hushkey/pg-service`     | Postgres backend (docs as JSONB)                                       |
| `sqlite-service/` | `@hushkey/sqlite-service` | SQLite backend (docs as JSON1)                                         |
| `studio/`         | `@hushkey/studio`         | Admin UI middleware + React component over the service contract        |

`@hushkey/howl` internal layout and export paths:

| Directory               | Export path                | Responsibility                                          |
| ----------------------- | -------------------------- | ------------------------------------------------------- |
| `howl/core/`            | `"."`                      | `Howl` class, `Context`, routing, segments, engine seam |
| `howl/api/`             | `"./api"`, `"./api/cache"` | `defineApi`, `apiHandler`, cache adapters, OpenAPI      |
| `howl/dev/`             | `"./dev"`                  | `HowlBuilder`, `Builder`, esbuild pipeline, CSS modules |
| `howl/plugins/`         | `"./plugins"`              | Tailwind v4 plugin                                      |
| `howl/core/middlewares` | `"./middleware"`           | Built-in middleware barrel                              |
| `howl/utils/`           | internal                   | `build-id.ts`                                           |
| `howl/tests/`           | internal                   | Test suites and harness                                 |

---

## File-system conventions (user project)

| Item         | Path pattern                                                    |
| ------------ | --------------------------------------------------------------- |
| Pages        | `pages/**/*.vue` (vue engine) · `pages/**/*.tsx` (react engine) |
| AOT pages    | `pages/**/__name.{vue,tsx}`                                     |
| SSG pages    | `pages/**/___name.{vue,tsx}`                                    |
| Layouts      | `pages/_layout.{vue,tsx}`                                       |
| App wrapper  | `pages/_app.{vue,tsx}`                                          |
| Error page   | `pages/_error.{vue,tsx}`                                        |
| Middleware   | `middleware/**/*.middleware.ts`                                 |
| APIs         | `apis/**/*.api.ts`                                              |
| Static       | `static/**/*`                                                   |
| Config       | `howl.config.ts`                                                |
| Build output | `_howl/` (dev) · `dist/` (production)                           |

---

## Render engines (core concept)

Core is view-library-agnostic. An app selects its engine explicitly:

```ts
new Howl<State>({ engines: { vue: vueEngine() } }); // or { react: reactEngine() }
```

- The `RenderEngine` contract lives in `howl/core/engine.ts` (`render`, optional `renderToString`,
  `EngineRouteInfo` for DevTools route maps).
- Engine **esbuild plugins** (`vuePlugin()` / `reactPlugin()`) declare which file extensions they
  own under the shared `Symbol.for("howl.engine")` — `dev/builder.ts` reads it during FS crawl to
  tag each route with its engine. Registering page routes without an engine throws
  (`assertEngineSelected`).
- Per-engine chunk maps on `BuildCache`: `enginePages` (page file → hydration chunk URL),
  `engineAot` (AOT route pattern → client chunk), `engineSsrModules` (page file → precompiled SSR
  module, prod).
- **Vue prod**: `HowlBuilder.build()` precompiles every `.vue` page chain into an importable SSR
  module (`bundleVueSsr`), statically imported by the snapshot — `deno compile` binaries need no
  `.vue` source on disk. Dev compiles per request with an mtime cache.
- `ctx.renderToString(component, props)` delegates to the first registered engine that implements it
  (standalone rendering, e.g. emails).

The legacy Preact renderer, `<Partial>` AOT system, React→Preact compat aliasing, **and the entire
islands system** were **removed in June 2026** — don't reference `preactEngine()`,
`runtime/client/*`, `partial_boundary.ts`, `BuildCache.aotRoutes`, `*.island.tsx` / `*.island.vue`
files, `islandRegistry`, `IslandPreparer`, `bootVueIslands`, or `vueIslands` / `vueBoot`; none of
them exist. The model is **thick client**: SSR first paint → full-page hydrate → SPA. Interactive
components are ordinary components inside hydrated pages.

---

## Core request flow

```
HTTP Request
→ Global middlewares (app.use())
→ UrlPatternRouter.match()
→ Segment middleware stack (root→leaf, layouts stacked)
→ Route handler → data | Response
→ Engine renders the page (app wrapper + layouts + page) → HTML
→ ctx.cookies + ctx.headers merged into response
→ HTML sent (hydration chunk preloaded via modulepreload)
```

API requests bypass the segment/layout stack — they go straight through `preAsyncHandler`
(validation) → `asyncHandler` (auth, rate limit, cache, execution).

---

## Key classes and their roles

### `Howl<State>` — `packages/howl/core/app.ts`

The single app class. Builder-pattern methods return `this`. `app.use()`, `.get/post/...()`,
`.fsClientRoutes()`, `.fsApiRoutes()`, `.ws()`, `.listen()`, `.handler()`.

Internal state (`#commands`) is a flat list of `Command<State>` objects; `applyCommands()` in
`commands.ts` resolves them into a router + segment tree at handler-creation time.

### `Context<State>` — `packages/howl/core/context.ts`

One per request. Key properties: `url`, `req`, `params`, `state`, `headers` (response), `cookies`
(CookieManager), `isPartial`, `route`, `error` (set for `_error` pages).

Response helpers: `ctx.json()`, `ctx.html()`, `ctx.text()`, `ctx.redirect()`, `ctx.stream()`,
`ctx.sse()`, `ctx.renderToString()`. All merge `ctx.headers` so middleware-set headers/cookies
propagate. Page rendering itself happens in the segment pipeline via the registered engine — there
is no `ctx.render()`.

### `app.ws()` — WebSocket endpoints

```ts
app.ws("/ws", {
  open(socket, ctx) {
    const userId = ctx.state.userContext?.user?.id;
    if (!userId) socket.close(1008, "Unauthorized");
  },
  message(socket, event) {/* … */},
  close(socket, code, reason, ctx) {/* … */},
  error(socket, event, ctx) {/* … */},
}, { idleTimeout: 30 });
```

Always managed mode. Howl extension: `options.port` binds the endpoint to its own `Deno.serve`
listener — same middleware pipeline, but hidden from the main port and only the registered WS paths
are reachable on the secondary listener. `app.listen()` spawns the secondary listeners
automatically. Non-WebSocket requests to a registered WS path return `426 Upgrade Required`.

### `ctx.sse()` — Server-Sent Events

```ts
return ctx.sse(async (send) => {
  send({ data: { hello: "world" }, event: "update", id: 1, retry: 3000 });
});
```

Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
`SSEEvent` interface: `{ data: unknown; event?: string; id?: string | number; retry?: number }`.
Exported from `@hushkey/howl` as `type SSEEvent`.

### `CookieManager` — `packages/howl/core/cookies.ts`

`ctx.cookies.get/set/delete/all()`. Default set options: `httpOnly`, `sameSite: Strict`, `path: /`.
Uses `headers.append()` for `Set-Cookie`.

### `preAsyncHandler` — `packages/howl/api/pre-async-handler.ts`

Validates path params, query params, and JSON body via Zod. Stores results via
`setApiRequestState(ctx, { body, query, rawBody })` — a WeakMap keyed on the context object
(`packages/howl/api/_request_state.ts`). **Does not consume** `multipart/form-data` or
`application/x-www-form-urlencoded` body streams — handlers can call `ctx.req.formData()` safely.

### `asyncHandler` — `packages/howl/api/async-handler.ts`

Auth (via `checkPermissionStrategy`), rate limiting, `before` hooks, cache read, handler execution,
response formatting, cache write, `after` hooks. Response contract is **pass-through**: handler
return == body. Howl lifts `statusCode`/`status` out as the HTTP status, strips `ok`, and emits the
rest verbatim with `ok: true` injected. Handlers that want a `data` field on the wire must return
one explicitly (`{ status: 200, data: [...] }` → `{ ok: true, data: [...] }`); Howl does not
auto-nest.

Pipeline guarantees: only 2xx (non-204) responses are cached, and cached entries replay their
original status. Unexpected throws return the generic `"Something went wrong, try again."` — only
`HttpError` / sub-500 `status` hints expose their message; the real error + stack is logged under
the `correlationId`.

Per-route hooks on the definition: `before: ApiBeforeHook[]` (post-auth/validation, pre-cache;
returning a `Response` short-circuits the handler) and `after: ApiAfterHook[]`
(`(ctx, response,
app)`, runs on every successful response including cache hits, may replace the
response; skipped on errors).

Rate limit counters use `rateLimitCache` (separate from the response `cache`) so they can be shared
across instances via Redis/KV while response caching stays per-instance in memory.

---

## API definition pattern

```ts
// apis/public/ping.api.ts
import { defineApi } from "../../howl.config.ts";

export default defineApi({
  name: "Ping",
  directory: "public", // used as OpenAPI tag; path inferred from FS
  method: "GET",
  roles: [], // empty = public
  responses: {
    200: z.object({ message: z.string() }),
  },
  // Per-route rate limit — overrides defaultRateLimit from config
  rateLimit: { max: 10, windowMs: 60_000 },
  // Sensitive endpoint — lock out for 1 hour after 5 failed attempts
  // rateLimit: { max: 5, windowMs: 60_000, blockDurationMs: 3_600_000 },
  // Disable rate limiting entirely for this route
  // rateLimit: false,
  handler: async (ctx, app) => ({ statusCode: 200, message: "pong" }),
});
```

Path inference: the FS location of the file is authoritative. `apis/public/ping.api.ts` →
`/api/public/ping`. Use `[param]` folders for path params. Explicit `path` overrides FS.

---

## Rate limiting

Configured on `HowlApiConfig` (default) and per-route in `defineApi`:

```ts
// howl.config.ts
defineConfig({
  defaultRateLimit: { max: 100, windowMs: 60_000 },
  // Shared backend required for multi-instance deployments:
  rateLimitCache: redisCache(redis), // rate limit counters — must be shared
  cache: memoryCache(), // response cache — per-instance is fine
});
```

`RateLimitConfig`:

- `max` — max requests allowed in the window
- `windowMs` — counting window in milliseconds
- `blockDurationMs?` — lockout duration after hitting the limit (defaults to remaining window)

Rate limit keys are `ratelimit:{identifier}:{method}:{pathname}`. The identifier is resolved via
`getRateLimitIdentifier(ctx)` on `HowlApiConfig` (e.g. `ctx.state.user?.id`). When the hook is unset
or returns `undefined`, the limiter falls back to the client IP from `x-forwarded-for` / `x-real-ip`
/ `remoteAddr`. Per-user response cache keys use the same hook; when it's unset, response caching is
**skipped** on role-protected routes (no safe per-user key).

---

## Client interactivity (no islands)

There is no islands system. Pages fully hydrate and become a SPA after first paint — interactive
components are plain Vue/React components inside pages. Inline env guards for code that must branch
per environment: `import { IS_SERVER, IS_BROWSER } from "@hushkey/howl"`.

---

## AOT and SSG pages

Page-file prefix opts a route into client-side navigation and/or build-time prerender. The prefix is
stripped from the URL pattern, so `pages/jobs/__index.vue` mounts at `/jobs/`.

| Prefix    | Mode | First paint                                       | Client nav to this route                  |
| --------- | ---- | ------------------------------------------------- | ----------------------------------------- |
| (none)    | SSR  | Engine renders every request                      | Fetches fresh SSR HTML                    |
| `__page`  | AOT  | Engine renders every request                      | Dynamic-imports a client chunk, no server |
| `___page` | SSG  | Prerendered HTML served from snapshot (no render) | Dynamic-imports a client chunk, no server |

How it's wired:

- **Detection** — `dev/fs_crawl.ts` reads the basename prefix and sets `aot` / `ssg` flags on
  `FsRouteFileNoMod`; flags are carried into the prod snapshot.
- **Chunk emission** — engine-owned. `dev/builder.ts` writes a wrapper entry per engine page
  ([..layouts, page]; the `_app` shell stays static in the DOM) exporting `hydrate()` and, for AOT
  routes, `aotMount(props)`. Vue AOT chunks additionally carry client render fns + scoped CSS so
  navigation needs no server round-trip.
- **Manifest** — `BuildCache.engineAot: Map<routePattern, chunkUrl>`, emitted by the engine as
  `window.__HOWL_VUE_AOT__` / `window.__HOWL_REACT_AOT__`; each engine's boot runtime intercepts
  `<a>` clicks + popstate and mounts the matching chunk.
- **SSG prerender** — `HowlBuilder.build()` runs the app handler at build time for each param-less
  SSG route. Captured HTML is stored in `BuildCache.ssgPages: Map<routePattern, html>`. Request-time
  short-circuit lives in `core/app.ts handler()` — checks `ssgPages.get(pattern)` for `GET`/`HEAD`
  non-partial requests before dispatching the middleware/handler chain.
- **Cache headers** — chunks are served with `Cache-Control: public, max-age=31536000, immutable` in
  production. `BUILD_ID` rotates per build, so each deploy gets unique chunk URLs → automatic cache
  invalidation. Build-ID lives in `packages/howl/utils/build-id.ts` (UUID or `DENO_DEPLOYMENT_ID` /
  `GITHUB_SHA`).

Limits / gotchas:

- SSG handlers run with an empty `ctx` — no `req`, no cookies, no per-user state. Anything per-user
  must stay on dynamic SSR.
- Dynamic params on SSG fall through with a `console.warn` until `getStaticPaths` is built.

---

## State and roles

`howl.config.ts` exports `State` interface, `roles` const, and `{ defineApi, config }` from
`defineConfig<State, Role>(...)`. Pass `config` to `app.fsApiRoutes(config)`.

---

## Commands system (`packages/howl/core/commands.ts`)

Routes and middlewares are stored as `Command<State>` objects and applied lazily at `app.handler()`
call time. `applyCommandsInner()` walks the command list and builds the router + segment tree. API
routes use a special `ApiRouteCommand` that is populated by `HowlBuilder` after API crawl.

---

## Cache adapters (`packages/howl/api/cache/`)

| Adapter                       | Import                    | Notes                                           |
| ----------------------------- | ------------------------- | ----------------------------------------------- |
| `memoryCache()`               | `@hushkey/howl/api/cache` | LRU in-memory, per-instance                     |
| `redisCache(redis)`           | `@hushkey/howl/api/cache` | Redis-backed, shared across instances           |
| `kvCache(kv)`                 | `@hushkey/howl/api/cache` | Deno KV — shared on Deploy, per-process locally |
| `tryCache(primary, fallback)` | `@hushkey/howl/api/cache` | Tiered with timeout fallback                    |

```ts
// Multi-instance setup
defineConfig({
  cache: tryCache(memoryCache(), redisCache(r)), // response cache
  rateLimitCache: redisCache(r), // rate limit — must be shared
});
```

---

## Built-in middlewares (`@hushkey/howl/middleware`)

| Middleware           | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `compression()`      | Gzip/deflate for text, JSON, JS, SVG responses                |
| `coalesceRequests()` | Deduplicates concurrent GETs to same URL (public routes only) |
| `staticFiles()`      | Serves `static/` directory                                    |
| `cors(options)`      | CORS headers                                                  |
| `csrf(options)`      | CSRF token validation                                         |
| `csp(options)`       | Content-Security-Policy                                       |
| `trailingSlashes()`  | Normalises trailing slash                                     |

**Recommended order:**

```ts
app.use(coalesceRequests()); // thundering herd protection — first
app.use(compression()); // compress all responses
app.use(staticFiles());
app.fsClientRoutes();
```

`coalesceRequests()` only deduplicates GET requests with no `Cookie` or `Authorization` header.
Authenticated requests always get their own handler execution.

---

## Dev / build

```ts
const builder = new HowlBuilder(app, {
  root?: string,
  serverEntry?: string,       // e.g. "./server/main.ts" — apis/ is relative to this
  importApp: () => import("./main.ts").then(m => m.app),
  alias?: Record<string, string>,
  plugins?: EsbuildPlugin[],  // include the engine plugin: vuePlugin() / reactPlugin()
});

await builder.listen({ port: 8000 }); // dev
await builder.build();                 // production
```

`HowlBuilder` injects CSS Modules automatically. The engine's esbuild plugin must be passed in
`plugins` — it owns the page/island file extensions and compiles them.

---

## Service layer (`service-core` + backends) and Studio

Separate from the HTTP framework: a Mongo-shaped document-store contract.

- `DocumentService` (service-core) owns write-boundary validation, audit/soft-delete meta envelope,
  optimistic locking (`version`), versioned cache invalidation, timeouts, telemetry.
- Backends implement `StorageBackend`
  (`insertOne / findOne / findMany / count / updatePaths /
  deleteOne` + `generateId` +
  `cachePrefix`); SQL backends store docs as JSONB/JSON1 and compile the neutral filter grammar
  (`$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists` + dot-paths).
- Every backend must pass `runConformanceSuite` from `@hushkey/service-core/conformance` — mongo/pg
  suites are env-gated (`MONGO_URL` / `PG_URL`), sqlite runs everywhere.
- `@hushkey/studio` mounts an admin UI through the service contract (validates, bumps version,
  stamps audit fields, respects soft delete): `app.use(studio({ services: {...} }))` → `/studio`, or
  `mode: "component"` + `<Studio endpoint>` inside a host dashboard.

---

## Error handling

```ts
throw new HttpError(404, "Not found"); // from packages/howl/core/error.ts
throw new HttpError(401);
```

Caught by `DEFAULT_ERROR_HANDLER` in `app.ts` (plain text) or by `asyncHandler` for API routes (JSON
`{ error, correlationId }` + `X-Howl-Correlation-Id` response header). Engine apps render
`pages/_error.{vue,tsx}` with `ctx.error` serialized into page props.

---

## Documentation rule (MANDATORY)

When you change a public API, middleware behaviour, convention, or anything user-facing, you
**must** update **all three** of the following before reporting the task done:

1. **`README.md`** (repo root) — the user-facing project README.
2. **`packages/howl/README.md`** — the JSR-published package README (engine/service packages have
   their own READMEs — update the one that owns the changed surface).
3. **`examples/www/server/docs/`** — JSON-driven docs site. Either edit an existing entry or add a
   new file and register it in
   [`examples/www/server/docs/manifest.json`](../examples/www/server/docs/manifest.json).

Each doc has a different audience and they drift independently if you only update one. If a
behaviour cannot be exercised from a Howl user app (purely internal refactor), say so explicitly in
your end-of-turn summary and skip — but the default is to update all three.

---

## Coding conventions

- **Deno / JSR idioms** — `import type`, `@std/*`, explicit `.ts` extensions.
- **No default exports on classes** — classes use named exports. API files use
  `export default defineApi(...)`.
- **No unnecessary comments** — code is self-documenting by naming; only add comments for
  non-obvious invariants or workarounds.
- **JSDoc on every exported symbol** — JSR enforces ≥80% doc coverage, and we target 100%. Every
  `export`ed function, class, interface, type, const, and interface field needs a JSDoc block.
  Public-facing constructors, methods, and overload signatures need their own block too. Run
  `deno task doc:lint` (and `doc:lint:services`) and fix any `missing-jsdoc` /
  `missing-explicit-type` errors before opening a PR.
  - Lead with one sentence stating _what_ the symbol is or does. Skip restating the type — that's
    already in the signature.
  - For interface fields, a single-line `/** … */` is enough.
  - For deprecated re-exports, write a one-line summary _plus_ the `@deprecated` tag — JSR treats
    `@deprecated`-only blocks as missing.
  - Add an explicit return type to top-level `export const` declarations so JSR can resolve the type
    without inference (avoids `missing-explicit-type`).
  - Don't fix `private-type-ref` by adding docs — those need the referenced type to be exported (or
    the public signature to stop referencing it).
- **`deno-lint-ignore no-explicit-any`** — use sparingly and only where Deno's inference truly
  cannot help.
- **`// deno-lint-ignore-file`** at file top only when the whole file requires it
  (`async-handler.ts`).
- **Return `this` from builder methods** for chainability.
- **Private fields with `#`** — use Deno's private class fields, not `_` prefix.
- **Prefer `for...of` over `.forEach()`** for async loops.

---

## Known internal conventions

- API request state is stored in a **WeakMap** (`packages/howl/api/_request_state.ts`), not on
  `ctx.state`. Use `getApiRequestState(ctx).body`, `.query`, `.rawBody` — never
  `(ctx.state as any).__body`.
- `ctx.state.__body` / `ctx.state.__query` / `ctx.state.__rawBody` — **old pattern, do not use**.
  The WeakMap approach keeps internal state off the user's `State` type entirely.

---

## What NOT to do

- Don't reference Preact, `preactEngine()`, `<Partial>`, `BuildCache.aotRoutes`, or anything
  island-related (`*.island.*`, `islandRegistry`, `bootVueIslands`) — removed June 2026. Engines are
  Vue and React; interactivity is ordinary components in hydrated pages.
- Don't call `app.handler()` multiple times — it rebuilds the router each time.
- Don't store mutable state on the `Howl` instance between requests — use `ctx.state`.
- Don't add auth middleware inline — use `checkPermissionStrategy` in `defineConfig`.
- Don't parse `ctx.req.body` in API handlers — use `getApiRequestState(ctx).body`, already
  validated/typed.
- Don't create new `Proxy` objects in hot paths unnecessarily.
- Don't use `memoryCache()` as `rateLimitCache` in multi-instance deployments — counters are
  per-process.

---

## Testing

Framework tests live under `packages/howl/tests/`; each engine/service package has its own `tests/`
dir. No co-located `*_test.ts` files in source dirs.

| Layer       | Path                               | What it covers                                                                |
| ----------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Integration | `packages/howl/tests/integration/` | Routing, middleware order, ctx helpers, cookies, SSE, WS, CORS, CSP, coalesce |
| API         | `packages/howl/tests/api/`         | `defineApi`, auth, Zod validation, rate limit, caching, OpenAPI generation    |
| Unit        | `packages/howl/tests/unit/`        | `UrlPatternRouter`, `CookieManager`, utils, cache adapters, AOT/SSG crawl     |

Harness: `packages/howl/tests/harness.ts` exports `makeApp(opts)` returning `{ app, fetch }`. Tests
dispatch through the handler directly — no TCP port. Use `MockBuildCache` from `core/test_utils.ts`
if you need to seed FS routes.

Tasks (defined in root `deno.json`):

- `deno task test` — howl + init + vue + react suites (~190 framework tests + engine suites, all
  fast, no network)
- `deno task test:services` — service-core + backends + studio (mongo/pg conformance env-gated)
- `deno task test:integration` / `:api` / `:unit` / `:vue` / `:react` / `:init` — targeted
- `deno task check` / `check:services` — type-check public entrypoints
- `deno task doc:lint` / `doc:lint:services` — JSDoc coverage check (must stay clean)

**Test conventions:**

- Use `@std/expect` (`expect(...).toBe(...)`); avoid `assertEquals` etc. for consistency.
- Default `Deno.test("name", async () => {...})` — never disable `sanitizeOps`/`sanitizeResources`.
  If a test trips a leak, the production code is leaking; fix it there.
- Each test sets up its own `makeApp()` — no shared mutable fixtures.

---

## Examples

- `examples/www/` — howl.dev site + JSON-driven docs (the docs surface from the documentation rule)
- `examples/software-www/`, `examples/kawaii-www/` — additional site builds
- `examples/_vue/`, `examples/_react/` — engine playgrounds
- `examples/_backend/` — API-only app
- `examples/_db/` — service-layer / multi-database demo
