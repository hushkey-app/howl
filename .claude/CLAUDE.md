# Howl Framework — Claude Agent Guide

## What this repo is

Howl is a Deno-native full-stack framework built on top of Fresh 2.x. It powers
[Hushkey](https://hushkey.app). Single JSR package: `@hushkey/howl`.

Root: `~/Private/typescript/howl/`\
Stack: Deno 2.x · Fresh 2.2 (vendored) · Preact 10 · Zod 4 · esbuild 0.25

---

## Package map

| Package             | Export path   | Responsibility                                           |
| ------------------- | ------------- | -------------------------------------------------------- |
| `packages/core/`    | `"."`         | `Howl` class, `Context`, routing, segments, SSR, islands |
| `packages/api/`     | `"./api"`     | `defineApi`, `apiHandler`, cache adapters, OpenAPI       |
| `packages/dev/`     | `"./dev"`     | `HowlBuilder`, `Builder`, esbuild pipeline, CSS modules  |
| `packages/plugins/` | `"./plugins"` | Tailwind v4 plugin                                       |
| `packages/cli/`     | `"./cli"`     | Minimal CLI                                              |
| `packages/utils/`   | internal      | `build-id.ts`                                            |
| `packages/tests/`   | internal      | Test fixtures and helpers                                |

Middleware export path: `"./middleware"` → `packages/core/middlewares/mod.ts` API cache adapters:
`"./api/cache"` → `packages/api/cache/mod.ts`

---

## File-system conventions (user project)

| Item         | Path pattern                          |
| ------------ | ------------------------------------- |
| Pages        | `pages/**/*.tsx`                      |
| AOT pages    | `pages/**/__name.tsx`                 |
| SSG pages    | `pages/**/___name.tsx`                |
| Layouts      | `pages/_layout.tsx`                   |
| App wrapper  | `pages/_app.tsx`                      |
| Middleware   | `middleware/**/*.middleware.ts`       |
| Islands      | `islands/**/*.island.tsx`             |
| APIs         | `apis/**/*.api.ts`                    |
| Static       | `static/**/*`                         |
| Config       | `howl.config.ts`                      |
| Build output | `_howl/` (dev) · `dist/` (production) |

---

## Core request flow

```
HTTP Request
→ Global middlewares (app.use())
→ UrlPatternRouter.match()
→ Segment middleware stack (root→leaf, layouts stacked)
→ Route handler → PageResponse | Response
→ Page component rendered — single-pass renderToString (app + layouts + page)
→ ctx.cookies + ctx.headers merged into response
→ Link: preload headers added (JS modulepreload + CSS preload for islands)
→ HTML sent
```

API requests bypass the segment/layout stack — they go straight through `preAsyncHandler`
(validation) → `asyncHandler` (auth, rate limit, cache, execution).

---

## Key classes and their roles

### `Howl<State>` — `packages/core/app.ts`

The single app class. Builder-pattern methods return `this`. `app.use()`, `.get/post/...()`,
`.fsClientRoutes()`, `.fsApiRoutes()`, `.listen()`, `.handler()`.

Internal state (`#commands`) is a flat list of `Command<State>` objects; `applyCommands()` in
`commands.ts` resolves them into a router + segment tree at handler-creation time.

### `Context<State>` — `packages/core/context.ts`

One per request. Key properties: `url`, `req`, `params`, `state`, `headers` (response), `cookies`
(CookieManager), `isPartial`, `route`.

Response helpers: `ctx.json()`, `ctx.html()`, `ctx.text()`, `ctx.render()`, `ctx.redirect()`,
`ctx.partialRedirect()`, `ctx.stream()`, `ctx.sse()`.

All response helpers automatically merge `ctx.headers` so middleware-set headers/cookies propagate.

`ctx.render()` performs a **single-pass** `renderToString` covering the full tree (app wrapper +
layouts + page vnode). Previously two passes were used; the single-pass eliminates a redundant
render and saves ~5ms per request.

`ctx.render()` also appends `Link` preload headers — JS island chunks as `modulepreload`, CSS island
assets as `preload; as=style`. Browsers start fetching these assets as soon as they receive the HTTP
response headers, before parsing the HTML body.

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

API matches Fresh 2.3's `app.ws()`. Always managed mode. Howl extension: `options.port` binds the
endpoint to its own `Deno.serve` listener — same middleware pipeline, but hidden from the main port
and only the registered WS paths are reachable on the secondary listener. `app.listen()` spawns the
secondary listeners automatically.

Non-WebSocket requests to a registered WS path return `426 Upgrade Required`.

### `ctx.sse()` — Server-Sent Events

```ts
return ctx.sse(async (send) => {
  send({ data: { hello: "world" }, event: "update", id: 1, retry: 3000 });
});
```

Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
`SSEEvent` interface: `{ data: unknown; event?: string; id?: string | number; retry?: number }`.
Exported from `@hushkey/howl` as `type SSEEvent`.

### `CookieManager` — `packages/core/cookies.ts`

`ctx.cookies.get/set/delete/all()`. Default set options: `httpOnly`, `sameSite: Strict`, `path: /`.
Uses `headers.append()` for `Set-Cookie`.

### `preAsyncHandler` — `packages/api/pre-async-handler.ts`

Validates path params, query params, and JSON body via Zod. Stores results via
`setApiRequestState(ctx, { body, query, rawBody })` — a WeakMap keyed on the context object
(`packages/api/_request_state.ts`). **Does not consume** `multipart/form-data` or
`application/x-www-form-urlencoded` body streams — handlers can call `ctx.req.formData()` safely.

### `asyncHandler` — `packages/api/async-handler.ts`

Auth (via `checkPermissionStrategy`), rate limiting, cache read/write, handler execution, response
formatting. Response contract is **pass-through**: handler return == body. Howl lifts
`statusCode`/`status` out as the HTTP status, strips `ok`, and emits the rest verbatim with
`ok: true` injected. Handlers that want a `data` field on the wire must return one explicitly
(`{ status: 200, data: [...] }` → `{ ok: true, data: [...] }`); Howl does not auto-nest.

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
/ `remoteAddr`. Per-user response cache keys use the same hook (falling back to `"anonymous"`).

---

## Islands

- Files end in `.island.tsx` (convention enforced by warning in `dev/fs_crawl.ts`; non-matching
  files in the islands dir still register but log a rename hint at build time)
- Default islands SSR via `renderToString` and **hydrate** on the client — no flash on initial mount
- Skip SSR for the whole island: `export const howl = { ssr: false }` (empty markers, client uses
  `render()`)
- Skeleton placeholder for `ssr: false` islands:
  `export const howl = { ssr: false, skeleton: () => <Placeholder /> }` — receives the same props as
  the island, replaced by the real component on first client render
- One nested element opt-out: `<ClientOnly>{() => <Component />}</ClientOnly>` — for cases where
  most of the island SSRs fine but one child can't (e.g. sonner `<Toaster />`)
- Inline env guards: `import { IS_SERVER, IS_BROWSER } from "@hushkey/howl"` for branching
  individual lines
- Island CSS is automatically preloaded via `Link` response headers

---

## AOT and SSG pages

Page-file prefix opts a route into client-side navigation and/or build-time prerender. The prefix is
stripped from the URL pattern, so `pages/jobs/__index.tsx` mounts at `/jobs/`.

| Prefix        | Mode | First paint                                       | Client nav to this route                  |
| ------------- | ---- | ------------------------------------------------- | ----------------------------------------- |
| (none)        | SSR  | Renderer runs every request                       | Partial-nav fetches the partial fragment  |
| `__page.tsx`  | AOT  | Renderer runs every request                       | Dynamic-imports a client chunk, no server |
| `___page.tsx` | SSG  | Prerendered HTML served from snapshot (no render) | Dynamic-imports a client chunk, no server |

How it's wired:

- **Detection** — `dev/fs_crawl.ts` reads the basename prefix and sets `aot` / `ssg` flags on
  `FsRouteFileNoMod` (`dev/dev_build_cache.ts`).
- **AOT chunk emission** — `dev/plugins/aot.ts` is a virtual esbuild plugin that synthesises an
  entry file per AOT route. The chunk contains only what would appear **inside** the active
  `<Partial>` markers on an SSR response: inner layouts (those rendered below the partial) plus the
  page. Files above the partial — the `_app.tsx` shell and any outer `_layout.tsx` — are
  intentionally not bundled; they stay in the DOM across AOT navs so layout-level islands keep their
  state. The boundary is found by `dev/partial_boundary.ts`, which scans each file's source for the
  literal `Partial` identifier in JSX (`<Partial …>`) or `h`/`jsx`-call form. Aliased imports
  (`{ Partial as P }`) are not detected — use the literal `Partial` name. When no `<Partial>` is
  found in an AOT page's chain, chunk emission is silently skipped for that route: the page still
  SSRs (or serves prerendered HTML for SSG-prefixed routes) and client navigation falls through to a
  full document load — same fallback path as a regular SSR route. Inner-layout wrappers in the
  generated chunk use **module-scoped functions** (`PageOutlet`, `Inner1`, …) with a shared `_props`
  slot rather than inline `Component: () => child` arrows — that way Preact sees stable vnode
  `type`s for each layout's `<Component />` outlet and can preserve component instances across
  same-chunk re-renders (e.g. same-route param changes). `dev/builder.ts` registers AOT entries
  alongside islands during `bundleJs()`. Chunk URL pattern is `/_howl/js/{BUILD_ID}/aot_{slug}.js`.
- **Manifest** — `BuildCache.aotRoutes: Map<routePattern, chunkUrl>` is populated by the builder and
  emitted into the SSR response as `window.__HOWL_AOT__ = { ... }` (inline `<script>` injected by
  `HowlRuntimeScript` in `runtime/server/preact_hooks.ts`). Also emits
  `window.__HOWL_USER_STATE__ = JSON.stringify(ctx.state)` so client hooks can read the SSR state.
- **Client runtime** — `runtime/client/aot.ts` (imported by `runtime/client/mod.ts`) reads the
  manifest, intercepts `<a>` clicks + popstate, dynamic-imports the matching chunk on AOT-route
  navigation, and updates the live `PartialComp` via `setState` (keeps `ACTIVE_PARTIALS` intact so
  partial-nav back to SSR routes still works). Same-URL clicks are no-ops (no duplicate history
  entries).
- **SSG prerender** — `HowlBuilder.build()` runs the app handler at build time for each param-less
  SSG route (`/properties/:id` falls through with a warning until `getStaticPaths` is built).
  Captured HTML is stored in `BuildCache.ssgPages: Map<routePattern, html>`. Snapshot is re-flushed
  so the production runtime sees it. Request-time short-circuit lives in `core/app.ts handler()` —
  checks `ssgPages.get(pattern)` for `GET`/`HEAD` non-partial requests before dispatching the
  middleware/handler chain.
- **Cache headers** — AOT chunks are served with
  `Cache-Control: public, max-age=31536000,
  immutable` in production. `BUILD_ID` rotates per
  build, so each deploy gets unique chunk URLs → automatic cache invalidation. Build-ID lives in
  `packages/utils/build-id.ts` (UUID or `DENO_DEPLOYMENT_ID` / `GITHUB_SHA`).
- **Head component** — `runtime/head.ts` mounts a `ClientHead` on the browser that imperatively
  syncs `document.head` after each render commit. SSR-emitted Head elements carry `data-howl-head`
  markers (server adds the attribute in `runtime/server/preact_hooks.ts`). `<title>` is written via
  `document.title` directly (no DOM-element race during transitions); meta / link upsert by their
  natural key (`name`, `property`, `rel`); other elements append and track for clean unmount.

Limits / gotchas:

- SSG handlers run with an empty `ctx` — no `req`, no cookies, no per-user state. Anything per-user
  must stay on dynamic SSR.
- Dynamic params on SSG fall through with a `console.warn` until `getStaticPaths` is built.
- AOT chunk re-uses one cached `createRootFragment` outlet across renders — preact reconciles the
  same container rather than fresh-mounting against preact-tagged DOM.
- AOT pages currently hydrate via the partial-nav path on first paint. The page function isn't
  re-invoked client-side until a subsequent AOT click; `useEffect` inside the page won't fire on
  direct URL landings (auto-promote-on-paint is a roadmap item).

---

## State and roles

`howl.config.ts` exports `State` interface, `roles` const, and `{ defineApi, config }` from
`defineConfig<State, Role>(...)`. Pass `config` to `app.fsApiRoutes(config)`.

---

## Commands system (`packages/core/commands.ts`)

Routes and middlewares are stored as `Command<State>` objects and applied lazily at `app.handler()`
call time. `applyCommandsInner()` walks the command list and builds the router + segment tree. API
routes use a special `ApiRouteCommand` that is populated by `HowlBuilder` after API crawl.

---

## Cache adapters (`packages/api/cache/`)

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
  plugins?: EsbuildPlugin[],
});

await builder.listen({ port: 8000 }); // dev
await builder.build();                 // production
```

`HowlBuilder` injects CSS Modules and React→Preact aliases automatically.

---

## Error handling

```ts
throw new HttpError(404, "Not found"); // from packages/core/error.ts
throw new HttpError(401);
```

Caught by `DEFAULT_ERROR_HANDLER` in `app.ts` (plain text) or by `asyncHandler` for API routes (JSON
`{ error, correlationId }` + `X-Howl-Correlation-Id` response header).

---

## Documentation rule (MANDATORY)

When you change a public API, middleware behaviour, convention, or anything user-facing, you
**must** update **all three** of the following before reporting the task done:

1. **`README.md`** (repo root) — the user-facing project README.
2. **`packages/README.md`** — the JSR-published package README.
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
  `deno doc --lint` from `packages/` and fix any `missing-jsdoc` / `missing-explicit-type` errors
  before opening a PR.
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

- API request state is stored in a **WeakMap** (`packages/api/_request_state.ts`), not on
  `ctx.state`. Use `getApiRequestState(ctx).body`, `.query`, `.rawBody` — never
  `(ctx.state as any).__body`.
- `ctx.state.__body` / `ctx.state.__query` / `ctx.state.__rawBody` — **old pattern, do not use**.
  The WeakMap approach keeps internal state off the user's `State` type entirely.

---

## What NOT to do

- Don't use `App` (deprecated alias) — use `Howl`.
- Don't call `app.handler()` multiple times — it rebuilds the router each time.
- Don't store mutable state on the `Howl` instance between requests — use `ctx.state`.
- Don't skip `ctx.partialRedirect()` for partial-aware middleware guards.
- Don't add auth middleware inline — use `checkPermissionStrategy` in `defineConfig`.
- Don't parse `ctx.req.body` in API handlers — use `ctx.req.body` which is already typed/parsed.
- Don't create new `Proxy` objects in hot paths unnecessarily.
- Don't use `memoryCache()` as `rateLimitCache` in multi-instance deployments — counters are
  per-process.
- Don't use `renderToStringAsync` expecting a speed improvement — it's a DX shift only. Data
  fetching parallelism is achieved with `Promise.all()` in the route handler.
- Don't pass islands large data sets as SSR props if the data isn't needed for the initial paint —
  use `export const howl = { ssr: false }` and let the island fetch its own data on the client.

---

## Testing

All tests live under `packages/tests/` (no co-located `*_test.ts` files in `core/`, `api/`, `dev/`).
Three layers:

| Layer       | Path                          | What it covers                                                                         |
| ----------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| Integration | `packages/tests/integration/` | Routing, middleware order, ctx helpers, cookies, SSE, CORS, CSP, coalesce              |
| API         | `packages/tests/api/`         | `defineApi`, auth, Zod validation, rate limit, caching, OpenAPI generation             |
| Unit        | `packages/tests/unit/`        | `UrlPatternRouter`, `CookieManager`, utils, cache adapters (`memoryCache`, `tryCache`) |

Harness: [`packages/tests/harness.ts`](../packages/tests/harness.ts) exports `makeApp(opts)`
returning `{ app, fetch }`. Tests dispatch through the handler directly — no TCP port. Use
`MockBuildCache` from `core/test_utils.ts` if you need to seed FS routes or islands.

Tasks (defined in root `deno.json`):

- `deno task test` — full suite (currently 85 tests, ~700ms)
- `deno task test:integration` / `:api` / `:unit` — targeted
- `deno task doc:lint` — JSDoc coverage check (must stay clean)

**Test conventions:**

- Use `@std/expect` (`expect(...).toBe(...)`); avoid `assertEquals` etc. for consistency.
- Default `Deno.test("name", async () => {...})` — never disable `sanitizeOps`/`sanitizeResources`.
  If a test trips a leak, the production code is leaking; fix it there.
- Each test sets up its own `makeApp()` — no shared mutable fixtures.
- Browser-based fixtures + helpers live in `packages/tests/test_utils.tsx` (uses Astral). Most tests
  should not need it; reach for it only when you genuinely need a real browser.

---

## Examples

- `examples/basic/` — minimal single-app setup
- `examples/fullstack/` — fullstack with separate server + client dirs, multi-client pattern
