import { engineOf, isFullstack, type ProjectSpec, type ServiceLayer } from "../spec.ts";

/** Backend service class, package, and connection variable per database. */
const SERVICE_WIRING: Record<
  Exclude<ServiceLayer, "none">,
  { cls: string; pkg: string; conn: string }
> = {
  sqlite: { cls: "SqliteService", pkg: "@hushkey/sqlite-service", conn: "sqliteDb" },
  postgres: { cls: "PgService", pkg: "@hushkey/pg-service", conn: "pgClient" },
  mongo: { cls: "MongoService", pkg: "@hushkey/mongo-service", conn: "mongoDb" },
};

function uiLabel(ui: ProjectSpec["ui"]): string {
  if (ui === "shadcn") return "shadcn/ui";
  if (ui === "daisyui") return "daisyUI";
  return "Tailwind v4";
}

/**
 * `AGENTS.md` — a per-spec guide so AI coding agents pick up this app's
 * conventions and patterns immediately. Tailored to the chosen engine, UI kit,
 * and service layer; only documents what the project actually contains.
 */
export function agentsMd(spec: ProjectSpec): string {
  const engine = engineOf(spec.appType);
  const fullstack = isFullstack(spec);
  const ext = engine === "vue" ? "vue" : "tsx";
  const enginePkg = engine === "vue" ? "@hushkey/howl-vue" : "@hushkey/howl-react";
  const pageProps = engine === "vue" ? "VuePageProps" : "ReactPageProps";
  const L: string[] = [];

  L.push(`# AGENTS.md — ${spec.name}`, "");
  L.push(
    "Guidance for AI coding agents working in this **Howl** app — a server-first, " +
      "Deno-native full-stack framework (no Node, no npm, no Vite). SSR paints first, " +
      "then the page hydrates into an SPA. Full docs: https://howl.hushkey.dev/docs",
    "",
  );

  // ── Stack ──────────────────────────────────────────────────────────
  L.push("## Stack", "");
  L.push("- Deno 2.x · TypeScript · Zod 4");
  if (engine === null) {
    L.push("- API-only — no view engine, no client pages");
  } else {
    L.push(
      `- View engine: ${engine === "vue" ? "Vue (.vue SFC pages)" : "React (.tsx pages)"} via ${enginePkg}`,
    );
    L.push(`- UI: ${uiLabel(spec.ui)}`);
  }
  if (spec.service !== "none") {
    L.push(`- Service layer: ${spec.service} (document store) + Studio admin at \`/studio\``);
  }
  L.push("");

  // ── Commands ───────────────────────────────────────────────────────
  L.push("## Commands", "");
  L.push("```sh");
  L.push("deno task dev       # watch + live reload on :8000");
  L.push("deno task build     # production build -> dist/");
  L.push("deno task start     # run the built server");
  L.push("deno task compile   # self-contained binary");
  L.push("```", "");

  // ── Layout ─────────────────────────────────────────────────────────
  L.push("## Layout", "");
  L.push("```");
  L.push("server/");
  L.push("  apis/**/*.api.ts     typed API routes (sample: public/ping)");
  if (spec.service !== "none") {
    L.push("  services/<entity>/   schema + service per collection");
  }
  L.push("  main.ts              the Howl app: engine, middleware, routes");
  if (fullstack) {
    L.push("client/");
    L.push(`  pages/**/*.${ext}     file-system-routed pages (_app, _layout, _error are structural)`);
    L.push("static/                served at /static/*");
  }
  L.push("generated/http-client.ts  typed client generated from apis/ (do not edit)");
  L.push("howl.config.ts         State, roles, defineApi factory");
  L.push("dev.ts                 build/dev wiring (HowlBuilder + plugins)");
  L.push("```", "");

  // ── Add an API route ───────────────────────────────────────────────
  L.push("## Add an API route", "");
  L.push(
    "Create `server/apis/<dir>/<name>.api.ts` and default-export `defineApi` from " +
      "`howl.config.ts` (State + roles are already bound). The file's path under `apis/` " +
      "is the URL (prefixed `/api`); use `[param]` folders for path params.",
    "",
  );
  L.push("```ts");
  L.push('import { z } from "zod";');
  L.push('import { defineApi } from "../../../howl.config.ts";');
  L.push("");
  L.push("export default defineApi({");
  L.push('  name: "ListItems",');
  L.push('  directory: "items",        // REQUIRED — OpenAPI tag');
  L.push('  method: "GET",');
  L.push("  roles: [],                  // [] = public; else listed roles (see checkPermissionStrategy)");
  L.push("  query: z.object({ limit: z.coerce.number().max(100).optional() }),");
  L.push("  responses: { 200: z.object({ data: z.array(z.any()) }) },");
  L.push("  handler: (ctx) => ({ status: 200, data: [] }),");
  L.push("});");
  L.push("```", "");
  L.push("Rules:");
  L.push("- `directory` is **required**.");
  L.push(
    "- Read the validated body via `ctx.req.body` and query via `ctx.query()` (a **method**, " +
      "not a property). Both are typed from the Zod schemas — never parse `ctx.req` yourself.",
  );
  L.push(
    "- The handler's return value is the body: `status`/`statusCode` becomes the HTTP status, " +
      "`ok: true` is injected, the rest is emitted as-is. Howl does **not** auto-nest — return " +
      "`{ status, data }` to get a `data` field.",
  );
  L.push('- Throw `new HttpError(status, message)` (from `@hushkey/howl`) for controlled errors.');
  L.push("");

  // ── The request context (ctx) ──────────────────────────────────────
  L.push("## The request context (`ctx`)", "");
  L.push(
    "Every middleware, route handler, and API handler receives one `Context` (`ctx`), " +
      "unique per request. It carries the incoming request, accumulates the response " +
      "(headers + cookies as you go), and builds the final `Response`.",
    "",
  );
  L.push("Inputs (read-only unless noted):", "");
  L.push("| Field | What it is |");
  L.push("| --- | --- |");
  L.push("| `ctx.url` | The request `URL`, parsed. |");
  L.push(
    "| `ctx.req` | The original `Request`. In an API handler `ctx.req.body` is the " +
      "**validated, typed** body (from the `body` Zod schema) — never re-parse it. |",
  );
  L.push("| `ctx.params` | Path params from `[param]` route folders (all strings). |");
  L.push(
    "| `ctx.query(key?)` | Query-string reader — a **method**: `ctx.query(\"q\")` → one " +
      "value, `ctx.query()` → all. |",
  );
  L.push(
    "| `ctx.state` | Per-request `State`, shared across middleware + handlers. Serialized " +
      "into the page HTML for hydration → treat as **public**, never put secrets on it. |",
  );
  L.push("| `ctx.data` | Mutable slot middleware fills and handlers read. |");
  L.push(
    "| `ctx.cookies` | `get / set / delete / all`. Defaults: `httpOnly`, `sameSite: Strict`, " +
      "`path: /`. |",
  );
  L.push("| `ctx.headers` | Mutable response `Headers`; merged into every response below. |");
  L.push("| `ctx.error` | The caught error value, if any (rendered by `_error` pages). |");
  L.push("| `ctx.info` | Deno connection info (remote / local address). |");
  L.push("| `ctx.route` | The matched route pattern. |");
  L.push("| `ctx.config` | The resolved Howl config. |");
  L.push("| `ctx.next()` | Call the next middleware; returns its `Response`. |");
  L.push("");
  L.push(
    "Response builders — **all merge `ctx.headers`**, so cookies/headers set earlier in " +
      "middleware always propagate:",
    "",
  );
  L.push("| Method | Builds |");
  L.push("| --- | --- |");
  L.push("| `ctx.json(body, init?)` | JSON response. |");
  L.push("| `ctx.text(str, init?)` | `text/plain`. |");
  L.push("| `ctx.html(str, init?)` | `text/html`. |");
  L.push(
    "| `ctx.redirect(path, status=302)` | Redirect; strips protocol-relative paths to " +
      "block open-redirects. |",
  );
  L.push("| `ctx.sse(gen, init?)` | Server-Sent Events stream (`text/event-stream`). |");
  L.push("| `ctx.stream(iter, init?)` | Chunked stream of strings / bytes. |");
  if (engine !== null) {
    L.push(
      "| `ctx.renderToString(Comp, props?)` | Render a component to an HTML string off the " +
        "request flow (emails, fragments). |",
    );
  }
  L.push("");
  L.push(
    "Note: **API handlers return a plain object, not a `Response`** (see *Add an API " +
      "route*). The `ctx.json` / `ctx.text` / `ctx.html` builders are for `app.get()`-style " +
      "handlers and middleware.",
    "",
  );

  // ── Add a service ──────────────────────────────────────────────────
  if (spec.service !== "none") {
    const w = SERVICE_WIRING[spec.service];
    L.push("## Add a service", "");
    L.push(
      `The service layer is a Mongo-shaped document store, separate from the HTTP layer. ` +
        `Each collection is one service class extending \`${w.cls}\` (\`${w.pkg}\`). The ` +
        `backend connection is opened **once** in \`server/services/connections.ts\` ` +
        `(\`${w.conn}\`) and shared by every service — don't open new connections per service.`,
      "",
    );
    L.push("Two files per entity under `server/services/<entity>/`:", "");
    L.push("```ts");
    L.push("// items.schema.ts — documentSchema wraps your fields in the managed envelope.");
    L.push('import { z } from "zod";');
    L.push('import { documentSchema } from "@hushkey/service-core";');
    L.push("export const itemsSchema = documentSchema({");
    L.push("  name: z.string().min(1),");
    L.push("  done: z.boolean().default(false),");
    L.push("});");
    L.push("export type Item = z.infer<typeof itemsSchema>;");
    L.push("```", "");
    L.push("```ts");
    L.push("// items.service.ts — storage wiring in the constructor, domain queries as methods.");
    L.push(`import { ${w.cls} } from "${w.pkg}";`);
    L.push(`import { ${w.conn} } from "../connections.ts";`);
    L.push('import { type Item, itemsSchema } from "./items.schema.ts";');
    L.push("");
    L.push(`export class ItemsService extends ${w.cls}<Item> {`);
    L.push(`  constructor() { super(${w.conn}, itemsSchema, { collectionName: "items" }); }`);
    L.push("");
    L.push("  // Keep domain queries on the service, not inlined in handlers:");
    L.push("  pending(): Promise<Item[]> { return this.find({ query: { done: false } }); }");
    L.push("}");
    L.push("export const itemsService = new ItemsService();");
    L.push("```", "");
    L.push("Register it for the Studio admin in `server/main.ts`:");
    L.push("```ts");
    L.push("app.use(studio({ services: { items: itemsService } }));");
    L.push("```", "");
    L.push(
      "**The envelope is managed for you — never declare these fields yourself:** `id` " +
        "(string), `version` (the optimistic-lock counter), and `meta` (`created_at` / " +
        "`created_by` / `updated_at` / `updated_by` / `deleted_at` / `deleted_by`).",
      "",
    );
    L.push("Service method surface (all `async`):", "");
    L.push("| Method | What it does |");
    L.push("| --- | --- |");
    L.push(
      "| `create(fields, { executionerId })` | Insert. Stamps `meta`, sets `version: 1`. " +
        "Returns the new doc. |",
    );
    L.push(
      "| `get(id, { viewDeleted? })` | One doc by id, or `null`. Soft-deleted excluded " +
        "unless `viewDeleted`. |",
    );
    L.push("| `mget(ids)` | Many by id in one call; `null` in the slot for each missing id. |");
    L.push(
      "| `find({ query, sort, limit, skip, select, viewDeleted? })` | Query with the filter " +
        "grammar. Returns an array. |",
    );
    L.push("| `count({ query, viewDeleted? })` | Match count. |");
    L.push(
      "| `patch(id, fields, { executionerId, allowDeleted? })` | Partial update; bumps " +
        "`version`. Returns the doc, or `undefined` if nothing matched. |",
    );
    L.push(
      "| `delete(id, { executionerId, hard? })` | **Soft** by default (`hard: true` to " +
        "purge). Returns `{ success, item, hard }`. |",
    );
    L.push("| `restore(id, { executionerId })` | Undo a soft delete. |");
    L.push("");
    L.push("Rules:");
    L.push(
      "- Pass `{ executionerId }` on every write (`create` / `patch` / `delete` / " +
        "`restore`) — it stamps the audit `meta`.",
    );
    L.push(
      "- Soft delete is the default: deleted docs vanish from `get` / `find` / `count` " +
        "unless you pass `viewDeleted`, and `restore()` brings them back.",
    );
    L.push(
      "- Optimistic locking: include the doc's current `version` in the `patch` fields; a " +
        "stale version fails the write instead of clobbering a concurrent update.",
    );
    L.push(
      "- Filter grammar: `$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists` plus " +
        "dot-paths into nested fields.",
    );
    L.push("- Call services from API handlers; keep handlers thin and the domain logic on the service.");
    L.push("");
  }

  // ── Pages ──────────────────────────────────────────────────────────
  if (fullstack) {
    L.push("## Pages", "");
    L.push(
      `- Files under \`client/pages/**\`; the path is the URL. \`_app\`, \`_layout\`, \`_error\` ` +
        "are structural, not routes.",
    );
    L.push(
      `- Type props with \`${pageProps}<Data, State>\`; set per-page \`<head>\` with \`useHead\` ` +
        `from \`${enginePkg}/head\`.`,
    );
    L.push(
      "- Fetch data **client-side** from the generated client (this app does not use server " +
        "loaders):",
    );
    L.push("```ts");
    L.push('import { http } from "../../generated/http-client.ts";');
    L.push("const res = await http.api.items.$get();   // { ok, status, ...body }");
    L.push("```");
    L.push("- Client-side navigation is opt-in via `client-nav` on `<body>` (already set in `_app`).");
    L.push("");
  }

  // ── Conventions ────────────────────────────────────────────────────
  L.push("## Conventions & gotchas", "");
  L.push("- No islands system — pages fully hydrate; interactive UI is ordinary components.");
  L.push(
    "- `ctx.state` is serialized into the page HTML for hydration → treat it as **public**. " +
      "Never put secrets on it.",
  );
  if (engine !== null) {
    L.push(
      `- The engine has two halves: the render engine in \`server/main.ts\` ` +
        `(\`${engine}Engine()\`) and the esbuild plugin in \`dev.ts\` (\`${engine}Plugin()\`).`,
    );
  }
  L.push("- `generated/http-client.ts` is regenerated on every build — never hand-edit it.");
  L.push("- Pin imports to the `@hushkey/howl` version already in `deno.json`.");
  L.push("");

  return L.join("\n");
}

/**
 * A one-line `CLAUDE.md` that points at {@link agentsMd}'s output, so Claude
 * Code picks up the guide by its native filename without duplicating content.
 */
export function claudeMd(): string {
  return `See [AGENTS.md](./AGENTS.md) for this project's conventions and patterns.\n`;
}
