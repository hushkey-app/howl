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
| `@hushkey/howl`         | Core runtime — routing, context, islands, SSR           |
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
│   └── islands/
│       └── counter.island.tsx
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
import type { State } from "../howl.config.ts";
import { apiConfig } from "../howl.config.ts";
import { middleware } from "./middleware/_index.middleware.ts";

export const app = new Howl<State>({ logger: true });

app.use(staticFiles());
app.configure(middleware);
app.fsApiRoutes(apiConfig); // crawls server/apis/, registers all .api.ts
app.fsClientRoutes(); // crawls client/pages/, mounts all routes

export default { app };
```

> `app.configure(fn)` returns `this` synchronously when `fn` is sync, and
> `Promise<this>` when `fn` is async — so you can `await app.configure(async (a) => { await db(); })`
> for boot-time async work and keep chaining sync calls below it.

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

Rate limit counters are written via `cache.incr(key, ttl)`. Redis maps this to
`INCR` + `EXPIRE` (atomic server-side); Deno KV uses an `atomic().check().set()`
CAS loop; the in-memory adapter is trivially atomic. Custom adapters without
`incr` fall back to read-modify-write — don't use that on a shared backend.

### Rate limit identifier

Counters key on whatever `getRateLimitIdentifier(ctx)` returns on
`HowlApiConfig` — Howl doesn't assume a `State` shape. Falls back to the
client IP when unset or `undefined`.

```ts
defineConfig({
  getRateLimitIdentifier: (ctx) => ctx.state.user?.id,
});
```

### Error envelope

API errors are returned as `{ error, correlationId }` plus an
`X-Howl-Correlation-Id` response header. The full route descriptor is logged
server-side only — it is no longer leaked on the wire.

### Response redaction is your job

Howl does not auto-mutate response payloads. The previous "redact any field
named `password`" behaviour was security theatre (`apiKey`, `token`, `secret`,
`pwd`, etc. all leaked) and has been removed. Strip sensitive fields in your
handler before returning.

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

| Tool                                              | Scope                          | Use when                                                                                  |
| ------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| `export const howl = { ssr: false }`              | Whole island                   | The component itself can't SSR (Mapbox, WebGL, libs that touch `window` on import)        |
| `<ClientOnly>{() => <X />}</ClientOnly>`          | One nested element             | Most of the island SSRs fine but one child crashes (sonner `<Toaster />`)                 |
| `import { IS_SERVER, IS_BROWSER } from "@hushkey/howl"` | One branch in code              | Need a different value or skip a side-effect on the server                                |

```tsx
// One nested widget
<ClientOnly>{() => <ThirdPartyWidget />}</ClientOnly>

// Inline guard
const stored = IS_BROWSER ? localStorage.getItem("prefs") : null;
```

For islands that opt out of SSR you can render a layout-matching placeholder so the page doesn't shift while the JS loads:

```tsx
export const howl = {
  ssr: false,
  skeleton: () => <div class="h-64 bg-base-200 animate-pulse rounded" />,
};
```

The skeleton receives the same props as the island and is replaced by the real component on hydration.

> Default islands (`ssr: true`, no directive) hydrate against their SSR output — no flash, no wipe.
> The hydrate switch is automatic; nothing to configure.

---

## File-system conventions (build-time enforcement)

Island files **must** be named `*.island.tsx` — both inside `islands/`
directories and inside `(_islands)` route groups. The crawler now throws on
mismatch instead of warning; this surfaced silent hydration bugs in prior
releases.

`Howl#handler()` is built lazily on first call and cached per listener.
Registering routes after `handler()` has been built throws — wire everything
up before requesting the handler.

---

## AOT and SSG pages

Two filename prefixes opt a page into client-side navigation and/or
build-time prerendering. Direct URL hits always get SSR'd HTML (good for SEO
and first-paint); the prefix changes how *subsequent* navigation works.

| Prefix          | Mode | First paint                                    | Client nav to this page                        |
| --------------- | ---- | ---------------------------------------------- | ---------------------------------------------- |
| (none)          | SSR  | Renderer runs per request                      | Partial-nav fetches the partial fragment       |
| `__page.tsx`    | AOT  | Renderer runs per request                      | Dynamic-imports a client chunk, no server hit  |
| `___page.tsx`   | SSG  | Prerendered HTML served from snapshot (no JS run) | Dynamic-imports a client chunk, no server hit |

`__` builds an ESM chunk per page that includes the page's ancestor
`_layout.tsx` chain. On click, the chunk is `import()`-ed and rendered into
the active `<Partial>` outlet. `___` additionally runs the handler at build
time, captures the HTML, and bakes it into the production snapshot so
request-time renders are skipped entirely.

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
      <Head><title>About</title></Head>
      <p>Static content.</p>
    </>
  );
}
```

SSG limits and gotchas:

- The build invokes the handler with an empty `ctx` — no `req`, no cookies,
  no per-user state. Anything user-specific must stay on the dynamic SSR
  path.
- Dynamic params (e.g. `/properties/:id`) are not yet enumerated at build
  time — a `getStaticPaths` API is on the roadmap. SSG-flagged routes with
  params fall through to dynamic SSR with a build-time warning.
- Build IDs rotate per build, so AOT chunks are served with
  `Cache-Control: public, max-age=31536000, immutable` in production.
- Every SSR response for an AOT/SSG route injects two globals:
  `window.__HOWL_AOT__` (the route → chunk URL map) and
  `window.__HOWL_USER_STATE__` (the snapshot of `ctx.state` at SSR time).

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
