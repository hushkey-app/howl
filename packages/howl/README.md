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

| Import                     | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `@hushkey/howl`            | Core runtime — routing, context, islands, SSR                        |
| `@hushkey/howl/dev`        | Build pipeline — esbuild, HMR                                        |
| `@hushkey/howl/plugins`    | Official plugins — Tailwind v4, typed http client gen                |
| `@hushkey/howl/api`        | Endpoint contracts — defineApi, Zod validation, OpenAPI              |
| `@hushkey/howl/middleware` | Built-in middlewares — coalesceRequests, compression, cors, csrf, csp, staticFiles, trailingSlashes |

---

## Project structure

```
my-app/
├── client/
│   ├── pages/
│   │   ├── _app.tsx        ← root shell (html/head/body)
│   │   ├── _layout.tsx     ← shared UI layout (nav, sidebar, etc.)
│   │   └── index.tsx
│   └── islands/
│       └── counter.island.tsx
├── server/
│   ├── main.ts             ← app entrypoint
│   ├── middleware/
│   │   └── _index.middleware.ts
│   └── apis/
│       ├── public/
│       │   └── ping.api.ts
│       └── admin/
│           └── [table]/
│               ├── index.api.ts   ← /api/admin/:table
│               └── [id].api.ts    ← /api/admin/:table/:id
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

export const APP_NAME = Deno.env.get("APP_NAME") ?? "My App";
export const APP_VERSION = Deno.env.get("APP_VERSION") ?? "0.0.0";

export interface UserContext {
  user?: { id: string; roles: Role[] };
}

export interface State {
  userContext?: UserContext;
  client: {
    title: string;
    version: string;
  };
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
import { coalesceRequests, compression } from "@hushkey/howl/middleware";
import type { State } from "../howl.config.ts";
import { apiConfig } from "../howl.config.ts";
import { middleware } from "./middleware/_index.middleware.ts";

export const app = new Howl<State>({ logger: true });

app.use(coalesceRequests()); // thundering-herd protection — must be first
app.use(compression());
app.use(staticFiles());
app.configure(middleware);
app.fsApiRoutes(apiConfig); // crawls server/apis/, registers all .api.ts
app.fsClientRoutes(); // crawls client/pages/, mounts all routes

export default { app };
```

> `app.configure(fn)` returns `this` synchronously when `fn` is sync, and
> `Promise<this>` when `fn` is async — so you can `await app.configure(async (a) => { await db(); })`
> for boot-time async work and keep chaining sync calls below it.

**`server/middleware/_index.middleware.ts`**

```typescript
import { Howl } from "@hushkey/howl";
import type { State } from "../howl.config.ts";
import { APP_NAME, APP_VERSION } from "../howl.config.ts";

export const middleware = (app: Howl<State>) => {
  app.use((ctx) => {
    ctx.state.client = {
      title: APP_NAME,
      version: APP_VERSION,
    };

    return ctx.next();
  });

  app.use((ctx) => {
    ctx.headers.set("X-Request-Id", crypto.randomUUID());
    ctx.headers.set("X-Powered-By", `${APP_NAME}/${APP_VERSION}`);

    return ctx.next();
  });
};
```

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
});

tailwindPlugin(builder.getBuilder("default")!);

if (Deno.args.includes("build")) {
  await builder.build();
} else {
  await builder.listen();
}
```

**`client/pages/_app.tsx`** — root HTML shell

```tsx
import type { PageProps } from "@hushkey/howl";
import type { JSX } from "preact";
import { Partial } from "@hushkey/howl/runtime";
import type { State } from "../../howl.config.ts";

export default function App({ Component, state }: PageProps<unknown, State>): JSX.Element {
  return (
    <html>
      <head>
        <title>{state.client?.title ?? "My App"}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body f-client-nav>
        <Partial name="main">
          <Component />
        </Partial>
      </body>
    </html>
  );
}
```

**`client/pages/_layout.tsx`** — shared UI layout (nav, sidebar, etc.)

```tsx
import type { PageProps } from "@hushkey/howl";
import type { JSX } from "preact";
import type { State } from "../../howl.config.ts";

export default function Layout({ Component, state }: PageProps<unknown, State>): JSX.Element {
  return (
    <>
      <div class="navbar bg-base-200">
        <div class="navbar-start">
          <a href="/" class="btn btn-ghost text-xl">🐺 {state.client?.title}</a>
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

> **Note:** `@hushkey/howl/runtime` must point to `shared.ts`, not `client/mod.ts`. `client/mod.ts`
> imports `partials.ts` which calls `document.addEventListener` at module level — it crashes
> server-side. `shared.ts` exports `Partial`, `IS_BROWSER`, `asset`, and `Head` safely for both
> server and client.

> **Partial-nav and non-HTML responses:** when a `f-client-nav` link points to a non-HTML resource
> (a file download, an image, a `Content-Disposition: attachment` response, etc.), the client SPA
> detects the non-HTML `Content-Type` and falls back to a full browser navigation instead of trying
> to apply the response as a partial. API routes are not the intended target for `<a href>` — use
> `fetch()` for those — but the same fallback applies if you accidentally link to one.

**`client/pages/index.tsx`**

```tsx
import type { Context } from "@hushkey/howl";
import type { JSX } from "preact";
import { Head } from "@hushkey/howl/runtime";
import type { State } from "../../howl.config.ts";

export default function Index(_ctx: Context<State>): JSX.Element {
  return (
    <>
      <Head>
        <title>{_ctx.state.client.title} — Home</title>
      </Head>
      <h1>Welcome to {_ctx.state.client.title}</h1>
      <p>v{_ctx.state.client.version}</p>
    </>
  );
}
```

---

## Middleware

Built-in middlewares are available via `@hushkey/howl/middleware` (barrel) or individual subpath
imports for tree-shaking.

```typescript
import {
  coalesceRequests,
  compression,
  cors,
  csp,
  csrf,
  staticFiles,
  trailingSlashes,
} from "@hushkey/howl/middleware";
```

```typescript
app.use(coalesceRequests()); // thundering-herd protection — must be first
app.use(compression());      // gzip/deflate for text, JSON, JS, SVG
app.use(staticFiles());
app.use(cors({ origin: "https://myapp.example.com", credentials: true }));
app.use(csrf());
app.use(csp({ reportOnly: false, reportTo: "/api/csp-reports" }));
app.use(trailingSlashes("never"));
```

`coalesceRequests()` deduplicates concurrent GET requests to the same URL. Only applies to requests
without a `Cookie` or `Authorization` header — authenticated requests always run their own handler.

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

**File-system routing**

The filesystem is the authoritative source for all API paths — no `path` field needed. `[param]`
brackets become `:param`. Within each folder, static files (no brackets) are always registered
before dynamic ones (`[param]`), so literal routes always match first. Explicit `path` in the
definition overrides.

```
server/apis/
├── public/
│   └── ping.api.ts                        → /api/public/ping
├── admin/
│   └── [table]/
│       ├── index.api.ts                   → /api/admin/:table
│       ├── [id].api.ts                    → /api/admin/:table/:id
│       └── restore.api.ts                 → /api/admin/:table/restore
└── authentication/
    └── oauth/
        ├── callback.api.ts                → /api/authentication/oauth/callback  ← registered first (static)
        └── [provider].api.ts              → /api/authentication/oauth/:provider ← registered after (dynamic)
```

```typescript
// server/apis/admin/[table]/[id].api.ts
export default defineApi({
  name: "Get Row",
  directory: "admin", // used for OpenAPI tag only
  method: "GET",
  roles: ["admin"],
  params: z.object({
    table: z.string(),
    id: z.string(),
  }),
  responses: {
    200: z.object({ row: z.any() }),
  },
  handler: (ctx) => {
    const { table, id } = ctx.params; // typed: { table: string; id: string }
    return { statusCode: 200, row: null };
  },
});
```

Rules:

- All files get their path from the filesystem — `directory + name` is bypassed
- Within each folder: static files load before `[param]` files, directories last
- Explicit `path` in the definition always wins over FS inference
- `params` Zod schema is still required for validation and OpenAPI typing

---

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

---

## Caching

Response caching is configured once in `howl.config.ts` and applied per-endpoint via
`caching: { ttl }`.

Three adapters ship out of the box:

| Adapter                       | Use case                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- |
| `memoryCache()`               | Default. In-process LRU, zero deps                                        |
| `redisCache(client)`          | Shared cache across instances. Accepts any ioredis-compatible client      |
| `kvCache(kv)`                 | Deno KV — globally consistent on Deno Deploy, SQLite-backed locally       |
| `tryCache(primary, fallback)` | Tries primary first, falls back on miss or error                          |

All built-in adapters expose an atomic `incr(key, ttl)` op which the rate
limiter uses to count requests safely under concurrent load on shared
backends. Custom adapters that omit `incr` fall back to a non-atomic
read-modify-write path — safe only when the backend isn't shared.

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

Rate limit counters are written via `cache.incr(key, ttl)`. On Redis this maps to
`INCR` + `EXPIRE` (atomic on the server). On Deno KV it uses an `atomic().check().set()`
CAS loop. On the in-memory adapter it is trivially atomic because the runtime is
single-threaded.

If you supply a custom adapter that doesn't implement `incr`, the rate limiter
falls back to a read-modify-write path — *don't* use that on a shared backend
or concurrent requests can punch through the limit.

### Rate limit identifier

Counters and per-user response cache keys are keyed on whatever
`getRateLimitIdentifier(ctx)` returns — Howl makes no assumptions about your
`State` shape. Define it on `HowlApiConfig` to read whichever field you store
(user id, session id, API key, tenant). When the hook is unset or returns
`undefined`, the limiter falls back to the client IP and per-user cache keys
fall back to `"anonymous"`.

```ts
defineConfig({
  getRateLimitIdentifier: (ctx) => ctx.state.user?.id,
  defaultRateLimit: { max: 100, windowMs: 60_000 },
});
```

### Error envelope

API errors are returned as `{ error, correlationId }` (HTTP status from the
thrown error). The `correlationId` is also set on the response as
`X-Howl-Correlation-Id`. The full internal route descriptor is logged
server-side only — it is no longer leaked on the wire.

```json
{ "error": "Forbidden", "correlationId": "5b6e1d2c-..." }
```

### Response redaction is your job

Howl no longer auto-mutates response payloads. Earlier releases scrubbed any
field literally named `password` from response bodies, but that gave a false
sense of security: `apiKey`, `token`, `pwd`, `secret`, `accessToken` and the
like all leaked through. Redaction is now the handler's responsibility — strip
sensitive fields before returning.

---

## Context extensions

```typescript
// Cookies — first class, append semantics preserved
ctx.cookies.set("token", jwt, { httpOnly: true, sameSite: "Strict" });
ctx.cookies.get("token");
ctx.cookies.delete("session");

// Response headers — auto-merged into all responses including page renders
ctx.headers.set("X-Request-Id", crypto.randomUUID());

// Query params
const search = ctx.query("q");
const all = ctx.query();
```

---

## React ecosystem

React libs work transparently — no configuration needed:

```tsx
// client/islands/ToastIsland.island.tsx
import { toast, Toaster } from "sonner";
import { useState } from "preact/hooks";
import { ClientOnly } from "@hushkey/howl";

export default function ToastIsland() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <ClientOnly>{() => <Toaster />}</ClientOnly>
      <button
        onClick={() => {
          setCount((c) => c + 1);
          toast.success(`${count + 1}`);
        }}
      >
        Click
      </button>
    </div>
  );
}
```

Three escape hatches for browser-only code, ordered from coarse to fine:

| Tool                                                    | Scope              | Use when                                                                              |
| ------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `export const howl = { ssr: false }`                    | Whole island       | Component itself can't SSR (Mapbox, WebGL, libs that touch `window` on import)        |
| `<ClientOnly>{() => <X />}</ClientOnly>`                | One nested element | Most of the island SSRs fine but one child crashes (e.g. sonner `<Toaster />`)        |
| `import { IS_SERVER, IS_BROWSER } from "@hushkey/howl"` | One branch in code | Need a different value or to skip a side-effect on the server                         |

```tsx
// Inline guard
const stored = IS_BROWSER ? localStorage.getItem("prefs") : null;
```

For islands that opt out of SSR you can supply a layout-matching skeleton so the page doesn't shift while JS loads:

```tsx
export const howl = {
  ssr: false,
  skeleton: () => <div class="h-64 bg-base-200 animate-pulse rounded" />,
};
```

The skeleton receives the same props as the island and is replaced by the real component on first client render.

> Default islands (`ssr: true`, no directive) hydrate against their SSR output — no flash, no wipe.
> The hydrate switch is automatic; nothing to configure.

---

## File-system conventions

Howl enforces naming conventions at build time. The crawler **throws** when an
island file isn't named `*.island.tsx` — both inside `islands/` directories and
inside `(_islands)` route groups. Earlier releases warned and continued; that
masked subtle hydration bugs, so it's now a hard error.

```
client/islands/Counter.island.tsx          ✅
client/islands/Counter.tsx                 ❌ throws at build
client/pages/foo/(_islands)/Foo.island.tsx ✅
client/pages/foo/(_islands)/Foo.tsx        ❌ throws at build
```

---

## AOT and SSG pages

Two page-file prefixes opt into client-side navigation and/or build-time
prerendering. Direct URL hits always serve fully rendered HTML; the prefix
only changes how subsequent in-app navigation works.

| Prefix         | Mode | First paint                              | Client nav                                |
| -------------- | ---- | ---------------------------------------- | ----------------------------------------- |
| (none)         | SSR  | Renderer runs per request                | Partial-nav fetches a partial fragment    |
| `__page.tsx`   | AOT  | Renderer runs per request                | Dynamic-imports a client chunk, no server |
| `___page.tsx`  | SSG  | Prerendered HTML served from snapshot    | Dynamic-imports a client chunk, no server |

AOT (double underscore) emits an ESM chunk per route, bundled with that
route's ancestor `_layout.tsx` chain. The chunk is `import()`-ed on first
click and rendered into the active `<Partial>` outlet — no full document
fetch, no re-execution of the SSR shell.

SSG (triple underscore) implies AOT and additionally runs the handler **once
at build time** with an empty `ctx`, capturing the HTML into the production
snapshot. Subsequent requests skip the renderer entirely — the cached HTML is
served directly.

```tsx
// pages/___about.tsx
import { Head } from "@hushkey/howl/runtime";

export default function About() {
  return (
    <>
      <Head><title>About</title></Head>
      <p>Built once at build time, served forever (per build).</p>
    </>
  );
}
```

**Constraints:**

- SSG handlers run with no `req`, no cookies, no per-user state. Pages whose
  output varies per user must stay on the dynamic SSR path.
- Dynamic-param routes (e.g. `/properties/:id`) are not yet enumerated at
  build time. A `getStaticPaths`-style API is on the roadmap. Until then SSG
  on parametric routes falls through to dynamic SSR with a build warning.
- AOT chunks are served with `Cache-Control: immutable` in production —
  `BUILD_ID` rotates per build, so each deploy invalidates its own URLs.

**Runtime globals injected on AOT/SSG SSR responses:**

- `window.__HOWL_AOT__` — `{ "/route": "/_howl/js/{BUILD_ID}/aot__route.js" }`
  consumed by the client-nav runtime to dynamic-import chunks.
- `window.__HOWL_USER_STATE__` — `JSON.stringify(ctx.state)` so client-side
  hooks/signals can seed from what the server rendered with. Public-facing
  only; do not put secrets in `ctx.state` if any route can flow through here.

---

## Building the handler

`Howl#handler()` builds the router lazily on first call and caches the result
per listener. Subsequent calls return the cached handler — `app.listen()`
spawns secondary `Deno.serve` listeners for WS-port routes that share the same
underlying state. Once `handler()` has been built, `app.use(...)`,
`app.get/post/...`, `app.fsApiRoutes(...)`, etc. throw — register all routes
and middleware before requesting the handler.

---

## Conventions

| Convention            | Path                                     |
| --------------------- | ---------------------------------------- |
| Root HTML shell       | `client/pages/_app.tsx`                  |
| Shared UI layout      | `client/pages/_layout.tsx`               |
| Pages                 | `client/pages/`                          |
| Islands               | `client/islands/`                        |
| Endpoint contracts    | `server/apis/**/*.api.ts`                |
| Middleware            | `server/middleware/`                     |
| Static files          | `static/`                                |
| Config                | `howl.config.ts`                         |
| Build output          | `dist/`                                  |
| OpenAPI spec          | `getApiSpecs()` from `@hushkey/howl/api` |
| Client runtime import | `@hushkey/howl/runtime` → `shared.ts`    |

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
