# 🐺 Howl

> The full-stack Deno framework powering [Hushkey](https://hushkey.app)

Howl is a backend-first, Deno-native full-stack framework built on top of
[Fresh](https://fresh.deno.dev). It was created to power Hushkey — a multi-vertical platform for
foreigners living in Japan — and is open-sourced under MIT for others to use.

---

## Why Howl

Fresh is excellent. But building a production platform on top of it revealed gaps that required
workarounds:

- No native cookie API on `ctx`
- Response headers set in middleware didn't propagate to page renders
- No React ecosystem compatibility without Vite
- No first-class typed endpoint system with Zod validation
- No auto-generated OpenAPI spec
- No role-based access control built in

Howl solves all of these natively.

---

## Packages

| Import                  | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `@hushkey/howl`         | Core runtime — routing, context, engine seam            |
| `@hushkey/howl/dev`     | Build pipeline — esbuild, HMR                           |
| `@hushkey/howl/plugins` | Official plugins — Tailwind v4, typed http client gen   |
| `@hushkey/howl/api`     | Endpoint contracts — defineApi, Zod validation, OpenAPI |

---

## Project structure

```
my-app/
├── client/
│   ├── pages/
│   │   ├── _app.tsx        ← root shell (html/head/body)
│   │   ├── _layout.tsx     ← shared UI layout (nav, sidebar, etc.)
│   │   └── index.tsx
│   └── components/
│       └── Counter.tsx
├── server/
│   ├── main.ts             ← app entrypoint
│   ├── middleware/
│   │   └── _index.middleware.ts
│   └── apis/
│       └── public/
│           └── ping.api.ts
├── static/
│   └── style.css
├── howl.config.ts          ← State type + defineApi factory
├── dev.ts                  ← dev/build entrypoint
└── deno.json
```

---

## Quick start

**`howl.config.ts`**

```typescript
import { defineConfig, memoryCache, redisCache, tryCache } from "@hushkey/howl/api";
import { Redis } from "ioredis";

const redis = new Redis(Deno.env.get("REDIS_URL") ?? "redis://localhost:6379");

export interface State {
  userContext?: UserContext;
}

export interface UserContext {
  user?: { id: string; roles: Role[] };
}

export const roles = ["user", "admin"] as const;
export type Role = typeof roles[number];

// defineConfig returns a pre-typed defineApi — import it in your .api.ts files
// so you don't need explicit <State, Role> type params everywhere.
export const { defineApi, config: apiConfig } = defineConfig<State, Role>({
  roles,
  // memory-first, Redis fallback — swap primary/fallback freely
  cache: tryCache(memoryCache({ maxSize: 1000 }), redisCache(redis)),
  checkPermissionStrategy: (ctx, allowedRoles) => {
    const user = ctx.state.userContext?.user;
    if (!user) return ctx.json({ message: "Unauthorized" }, { status: 401 });
    if (!allowedRoles.some((r) => user.roles.includes(r))) {
      return ctx.json({ message: "Forbidden" }, { status: 403 });
    }
    // return nothing = allow
  },
});
```

**`server/main.ts`**

```typescript
import { Howl, staticFiles } from "@hushkey/howl";
import { reactEngine } from "@hushkey/howl-react";
import type { State } from "../howl.config.ts";
import { apiConfig } from "../howl.config.ts";
import { middleware } from "./middleware/_index.middleware.ts";

// Page rendering is a registered engine (no implicit default) — React here.
export const app = new Howl<State>({ logger: true, engines: { react: reactEngine() } });

app.use(staticFiles());
app.configure(middleware);
app.fsApiRoutes(apiConfig); // crawls server/apis/, registers all .api.ts
app.fsClientRoutes(); // crawls client/pages/, mounts all routes

export default { app };
```

> `app.configure(fn)` returns `this` synchronously when `fn` is sync, and `Promise<this>` when `fn`
> is async — so you can `await app.configure(async (a) => { await db(); })` for boot-time async work
> and keep chaining sync calls below it.

**`dev.ts`**

```typescript
import { HowlBuilder } from "@hushkey/howl/dev";
import { tailwindPlugin } from "@hushkey/howl/plugins";
import { app } from "./server/main.ts";
import type { State } from "./howl.config.ts";

const builder = new HowlBuilder<State>(app, {
  root: import.meta.dirname ?? "",
  importApp: () => app,
  outDir: "dist",
  serverEntry: "./server/main.ts",
  clientEntry: "./client/pages/_app.ts",
  // Optional — defaults to "<root>/static". Point it anywhere (relative to
  // root, or absolute) to colocate assets, e.g. "./client/static". Pair it with
  // app.use(staticFiles()); the builder warns if the dir has files but the
  // middleware is missing (assets would 404 silently otherwise).
  staticDir: "./client/static",
});

tailwindPlugin(builder.getBuilder("default")!);

if (Deno.args.includes("build")) {
  await builder.build();
} else {
  await builder.listen();
}
```

> **npm tree-shaking** — Client bundles drop unused exports from npm barrel imports
> automatically. Importing one named export from a package that declares `"sideEffects": false`
> (`lucide-react` / `lucide-vue-next`, `date-fns`, radix, …) bundles only what you use instead of
> the whole library — no per-icon deep imports required. Applies to both engines, since it lives in
> the shared resolver rather than the engine plugin.

**`client/pages/_app.tsx`** — root HTML shell

```tsx
import type { RouteConfig } from "@hushkey/howl";
import type { FunctionComponent, JSX } from "preact";

export const config: RouteConfig = {};

export default function App({ Component }: { Component: FunctionComponent }): JSX.Element {
  return (
    <html>
      <head>
        <title>My App</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}
```

**`client/pages/_layout.tsx`** — shared UI layout (nav, sidebar, etc.)

```tsx
import type { FunctionComponent, JSX } from "preact";

export default function ({ Component }: { Component: FunctionComponent }): JSX.Element {
  return (
    <>
      <div class="navbar bg-base-200">
        <div class="navbar-start">
          <a href="/" class="btn btn-ghost text-xl">🐺 Howl</a>
        </div>
        <div class="navbar-end">
          <a href="/" class="btn btn-ghost btn-sm">Home</a>
          <a href="/docs" class="btn btn-ghost btn-sm">Docs</a>
        </div>
      </div>
      <main>
        <Component />
      </main>
    </>
  );
}
```

> **Client-nav and non-HTML responses:** when a `client-nav` link points to a non-HTML resource (a
> file download, an image, a `Content-Disposition: attachment` response, etc.), the client SPA
> detects the non-HTML `Content-Type` and falls back to a full browser navigation instead of trying
> to apply the response as a partial. API routes are not the intended target for `<a href>` — use
> `fetch()` for those — but the same fallback applies if you accidentally link to one.

### Link prefetching

Links inside an `client-nav` boundary are **prefetched on intent** — when the pointer hovers (after
a brief ~65 ms dwell so quick pass-overs don't fire) or a touch / keyboard-focus signals intent. AOT
routes pre-`import()` their JS chunk; SSR routes pre-fetch their SSR HTML. The eventual click reuses
the warmed result, so navigation feels instant — the same idea as Hotwired Turbo / instant.page.

It's on by default and respects the user's data-saver preference (`Save-Data` /
`prefers-reduced-data`). Opt a link or whole subtree out with `f-prefetch="false"`:

```tsx
<a href="/huge-report" f-prefetch="false">Report</a>
<nav f-prefetch="false"> … </nav>   {/* opt out an entire region */}
```

**`client/pages/index.tsx`**

```tsx
import type { Context } from "@hushkey/howl";
import type { State } from "../../howl.config.ts";

export default function Index(ctx: Context<State>) {
  return <h1>Hello, {ctx.state.userContext?.user?.id}</h1>;
}
```

---

## Endpoint contracts

Each `.api.ts` file is a self-contained, typed endpoint contract: method, roles, Zod-validated query
params / request body / responses, optional caching. No wiring needed — drop the file and it's live.

**`server/apis/public/ping.api.ts`**

```typescript
import { defineApi } from "../../../howl.config.ts"; // pre-typed, no <State, Role> needed
import { z } from "zod";

export default defineApi({
  name: "Ping",
  directory: "public",
  method: "GET",
  // path is optional — auto-generated as /api/public/ping
  roles: [],
  caching: { ttl: 5 },
  query: z.object({
    page: z.string().optional(),
    limit: z.string(),
  }),
  responses: {
    200: z.object({ ok: z.boolean(), message: z.string() }),
  },
  handler: (ctx) => {
    const { limit } = ctx.query(); // typed: { page?: string; limit: string }
    const page = ctx.query("page"); // typed: string | undefined
    return {
      statusCode: 200,
      ok: true,
      message: `pong 🐺 — page ${page ?? 1}, limit ${limit}`,
    };
  },
});
```

**`server/apis/private/users/get-me.api.ts`**

```typescript
import { defineApi } from "../../../../howl.config.ts";
import { z } from "zod";

export default defineApi({
  name: "Get Me",
  directory: "private/users",
  method: "GET",
  roles: ["user", "admin"], // typed — autocomplete works
  responses: {
    200: z.object({ data: z.any() }),
  },
  handler: async (ctx) => ({
    statusCode: 200,
    data: ctx.state.userContext, // ctx.state typed as State
  }),
});
```

**With typed request body:**

```typescript
import { defineApi } from "../../../howl.config.ts";
import { z } from "zod";

const body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export default defineApi({
  name: "Sign In",
  directory: "authentication",
  method: "POST",
  roles: [],
  requestBody: body,
  responses: {
    200: z.object({ data: z.object({ token: z.string() }) }),
    401: z.object({ message: z.string() }),
  },
  handler: async (ctx) => {
    const { email, password } = ctx.req.body; // fully typed
    return { statusCode: 200, data: { token: "jwt..." } };
  },
});
```

The OpenAPI spec is generated automatically. Expose it on any route you choose, with whatever auth
middleware you need:

```typescript
import { getApiSpecs } from "@hushkey/howl/api";

// public
app.get("/api/docs", (ctx) => ctx.json(getApiSpecs()));

// or gated behind a role
app.get("/api/docs", requireRole("admin"), (ctx) => ctx.json(getApiSpecs()));
```

`getApiSpecs()` returns `null` before the server starts, and the fully typed `OpenAPIV3_1.Document`
once routes are registered — query params, request body, path params, roles, and responses all
included.

### Before / after hooks

Per-endpoint middleware arrays for side effects around the handler — enqueue jobs, audit, decorate
responses. `before` runs after auth/rate-limit/validation (typed body and query already on `ctx`);
returning a `Response` short-circuits the handler. `after` runs on every successful response
(handler result, cache hit, or `before` short-circuit), receives the outgoing `Response`, and may
replace it. Hooks chain in array order; throwing aborts through the standard error envelope.

```typescript
export default defineApi({
  // ...
  before: [async (ctx, app) => void hound.enqueue("audit", { path: ctx.url.pathname })],
  after: [async (ctx, response, app) => void hound.enqueue("metrics", { status: response.status })],
  handler: (ctx) => ({ statusCode: 200, ok: true }),
});
```

---

## Caching

Response caching is configured once in `howl.config.ts` and applied per-endpoint via
`caching: { ttl }`. Only successful responses are cached (2xx, excluding 204) and a cached entry
replays its original status code — a handler returning an error never poisons the cache.

Three adapters ship out of the box:

| Adapter                       | Use case                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| `memoryCache()`               | Default. In-process LRU, zero deps                                   |
| `redisCache(client)`          | Shared cache across instances. Accepts any ioredis-compatible client |
| `kvCache(kv)`                 | Deno KV — globally consistent on Deno Deploy, SQLite-backed locally  |
| `tryCache(primary, fallback)` | Tries primary first, falls back on miss or error                     |

All built-in adapters expose an atomic `incr(key, ttl)` op which the rate limiter uses to count
requests safely under concurrent load on shared backends. Custom adapters that omit `incr` fall back
to a non-atomic read-modify-write path — safe only when the backend isn't shared.

```typescript
import { memoryCache, redisCache, tryCache } from "@hushkey/howl/api";
import { Redis } from "ioredis";

const redis = new Redis(Deno.env.get("REDIS_URL"));

// Redis-first, memory fallback
cache: tryCache(redisCache(redis), memoryCache({ maxSize: 1000 }));

// with timeout — falls back if primary doesn't respond within 150ms
cache: tryCache(redisCache(redis), memoryCache(), { timeoutMs: 150 });

// two Redis nodes (e.g. regional primary + global fallback)
cache: tryCache(redisCache(redisSG), redisCache(redisUS));
```

`redisCache` attaches an error listener automatically so ioredis reconnection events don't become
unhandled crashes — errors are logged via `console.warn` so they remain visible. Implement
`CacheAdapter` to plug in any other backend.

### Atomic rate limiting

Rate limit counters are written via `cache.incr(key, ttl)`. Redis maps this to `INCR` + `EXPIRE`
(atomic server-side); Deno KV uses an `atomic().check().set()` CAS loop; the in-memory adapter is
trivially atomic. Custom adapters without `incr` fall back to read-modify-write — don't use that on
a shared backend.

### Rate limit identifier

Counters key on whatever `getRateLimitIdentifier(ctx)` returns on `HowlApiConfig` — Howl doesn't
assume a `State` shape. Falls back to the client IP when unset or `undefined`; in that case response
caching is skipped on role-protected routes (no safe per-user cache key exists).

```ts
defineConfig({
  getRateLimitIdentifier: (ctx) => ctx.state.user?.id,
});
```

### Error envelope

API errors are returned as `{ error, correlationId }` plus an `X-Howl-Correlation-Id` response
header. The full route descriptor is logged server-side only — it is no longer leaked on the wire.
Only deliberate errors (`HttpError` / `errors.*`, or a sub-500 `status` hint) expose their message;
an unexpected throw returns a generic message and logs the real error + stack under the
`correlationId`.

### Response redaction is your job

Howl does not auto-mutate response payloads. The previous "redact any field named `password`"
behaviour was security theatre (`apiKey`, `token`, `secret`, `pwd`, etc. all leaked) and has been
removed. Strip sensitive fields in your handler before returning.

---

## Context extensions

```typescript
// Cookies — first class, append semantics preserved
ctx.cookies.set("token", jwt, { httpOnly: true, sameSite: "Strict" });
ctx.cookies.get("token");
ctx.cookies.delete("session");

// Response headers — auto-merged into all responses including page renders
ctx.headers.set("X-Request-Id", crypto.randomUUID());

// Request URL — scheme follows x-forwarded-proto, so it stays https behind a
// TLS-terminating proxy (and the URL serialised into client page props matches)
ctx.url.href;

// Query params
const search = ctx.query("q");
const all = ctx.query();
```

---

## Thick client — no islands

Every page server-renders for first paint (crawlable HTML), then **fully hydrates** and behaves as a
SPA. There is no islands system — interactive widgets are ordinary Vue/React components inside your
pages, and client navigation never reloads the document.

For code that must branch per environment, use the inline guards:

```tsx
import { IS_BROWSER, IS_SERVER } from "@hushkey/howl";

const stored = IS_BROWSER ? localStorage.getItem("prefs") : null;
```

Environment variables stay server-only unless explicitly opted in: variables prefixed
**`howl_PUBLIC_`** are inlined into the client bundle at build time, everything else never leaves
the server. Treat any `howl_PUBLIC_*` value as public — never put a secret behind that prefix.

---

## File-system conventions

> **Pluggable render engines — Vue & React.** Page rendering is a registered engine — there is **no
> implicit default**. The framework is split into three packages: [`@hushkey/howl`](packages/howl)
> (engine-agnostic core) · [`@hushkey/howl-vue`](packages/howl-vue) ·
> [`@hushkey/howl-react`](packages/howl-react). Select an engine on the app —
> `new Howl({ engines: { vue: vueEngine() } })` (or `react: reactEngine()`) — plus the matching
> builder plugin (`vuePlugin()` / `reactPlugin()`). The shared backend — routing, APIs, middleware,
> client-nav + prefetch, AOT/SSG, `deno compile` — is reused unchanged; only the component renderer
> differs, and both engines use the same `client-nav` / `client-prefetch` attributes. Each engine
> also backs `ctx.renderToString(component, props?)` — render a standalone template to an HTML
> string (emails, notifications) in whatever engine you picked, no page shell.
>
> **Programmatic navigation.** The Vue and React engines expose a router from
> `@hushkey/howl-{vue,react}/router` — `navigate(to, { replace?, scroll? })`, `navigate(-1)` for
> back/forward, `useNavigate()`, and a reactive `useRoute()`
> (`{ href, path, query, params, hash, route }`). It drives the same client-nav swap path as link
> clicks and falls back to a full load before hydration. In dev each engine also ships a route
> inspector: Vue populates Vue DevTools' built-in **Routes** tab (via a `vue-router`-shaped
> `$router` shim — no `vue-router` dependency), and React auto-mounts an in-app floating **Howl
> Routes** panel (React DevTools has no plugin-tab API). See the engine READMEs.
>
> If a **client entry with page routes** is configured but no engine is registered, the build throws
> (telling you to select one). Backend-only apps (no client entry) are unaffected. Demos:
> [`examples/vuety`](examples/vuety) · [`examples/reacty`](examples/reacty).

`Howl#handler()` is built lazily on first call and cached per listener. Registering routes after
`handler()` has been built throws — wire everything up before requesting the handler.

---

## AOT and SSG pages

Two filename prefixes opt a page into client-side navigation and/or build-time prerendering. Direct
URL hits always get SSR'd HTML (good for SEO and first-paint); the prefix changes how _subsequent_
navigation works.

| Prefix        | Mode | First paint                                       | Client nav to this page                       |
| ------------- | ---- | ------------------------------------------------- | --------------------------------------------- |
| (none)        | SSR  | Renderer runs per request                         | Partial-nav fetches the partial fragment      |
| `__page.tsx`  | AOT  | Renderer runs per request                         | Dynamic-imports a client chunk, no server hit |
| `___page.tsx` | SSG  | Prerendered HTML served from snapshot (no JS run) | Dynamic-imports a client chunk, no server hit |

`__` builds an ESM chunk per page containing the `[layouts, page]` tree (the `_app` shell stays
static in the DOM, so persistent chrome like navbars keeps its state across navigations). The engine
emits the AOT manifest (route pattern → chunk URL) into the page; on a client-nav click to an AOT
route the boot runtime `import()`s the chunk and renders it in place — no server round-trip. `___`
additionally runs the handler at build time, captures the HTML, and bakes it into the production
snapshot so request-time renders are skipped entirely. Routes navigated to that aren't AOT fall back
to the SSR fetch-and-swap path.

AOT navigation honours `client-nav` the same way SSR partial nav does. Drop the attribute from
`<body>` (or set it to `"false"`) and clicks on AOT links fall through to full document navigation —
same behaviour as SSR routes. Use `client-nav="false"` on a nested element to opt out a single
subtree (e.g. external dashboards) while leaving the rest of the app on SPA-style routing.

```tsx
// pages/__dashboard.tsx — dynamic SSR, client-navigable
export default function Dashboard(ctx) {
  return <p>Hello, {ctx.state.user?.name}</p>;
}
```

```tsx
// pages/___about.tsx — prerendered once at build time
import { Head } from "@hushkey/howl/runtime";

export default function About() {
  return (
    <>
      <Head>
        <title>About</title>
      </Head>
      <p>Static content.</p>
    </>
  );
}
```

SSG limits and gotchas:

- The build invokes the handler with an empty `ctx` — no `req`, no cookies, no per-user state.
  Anything user-specific must stay on the dynamic SSR path.
- Dynamic params (e.g. `/properties/:id`) are not yet enumerated at build time — a `getStaticPaths`
  API is on the roadmap. SSG-flagged routes with params fall through to dynamic SSR with a
  build-time warning.
- Build IDs rotate per build, so AOT chunks are served with
  `Cache-Control: public, max-age=31536000, immutable` in production.
- Every SSR response for an AOT/SSG route injects two globals: `window.__HOWL_AOT__` (the route →
  chunk URL map) and `window.__HOWL_USER_STATE__` (the snapshot of `ctx.state` at SSR time).

---

## Conventions

| Convention         | Path                                     |
| ------------------ | ---------------------------------------- |
| Root HTML shell    | `client/pages/_app.tsx`                  |
| Shared UI layout   | `client/pages/_layout.tsx`               |
| Pages              | `client/pages/`                          |
| Endpoint contracts | `server/apis/**/*.api.ts`                |
| Middleware         | `server/middleware/`                     |
| Static files       | `static/`                                |
| Config             | `howl.config.ts`                         |
| Build output       | `dist/`                                  |
| OpenAPI spec       | `getApiSpecs()` from `@hushkey/howl/api` |

---

## Built-in logger

```typescript
const app = new Howl<State>({
  logger: true, // timestamps + PID on all console output
  debug: true, // enables console.debug
});
```

---

# Powered by Hushkey

Howl is the framework behind [Hushkey](https://hushkey.app) — a platform helping foreigners navigate
housing, jobs, and daily life in Japan.

Every feature was built to solve a real production problem.

---

## License

MIT — see [LICENSE](./LICENSE)

Built with 🐺 by [Leo Termine](https://github.com/leopiney) and the Hushkey team.
