// deno-lint-ignore-file no-explicit-any
import type { DocumentService, DocumentShape } from "@hushkey/service-core";

/**
 * The slice of a request context the studio middleware needs. Howl's
 * `Context` satisfies it structurally — no framework dependency, so the
 * middleware also mounts on anything with the same shape.
 */
export interface StudioContext {
  /** Parsed request URL. */
  url: URL;
  /** The raw request. */
  req: Request;
  /** Continue down the middleware chain. */
  next(): Response | Promise<Response>;
}

/**
 * Style overrides for the studio UI. The dashboard is styled with daisyUI, so
 * these are daisyUI classes / a theme name the host can swap in to match its
 * brand. In standalone mode they are injected into the page and applied
 * automatically; in component mode pass the same object as the `<Studio>`
 * `style` prop.
 */
export interface StudioStyle {
  /** daisyUI theme name applied via `data-theme` (e.g. `dark`, `light`, or any
   * theme the host loads — overrides the persisted/system default). */
  theme?: string;
  /** Class(es) for primary actions (FIND, INSERT, APPLY…). Default `btn-primary`. */
  primaryColor?: string;
  /** Class(es) for secondary actions (migrate confirm…). Default `btn-secondary`. */
  secondaryColor?: string;
  /**
   * Extra stylesheet URL(s) to load in the standalone page `<head>`, after
   * daisyUI — point this at your own CSS (custom daisyUI theme, font, brand
   * overrides). Standalone mode only; component mode is styled by the host.
   */
  cssUrl?: string | string[];
}

/** Configuration for {@link studio}. */
export interface StudioOptions {
  /**
   * The services to administer, keyed by the name shown in the UI. Null /
   * undefined entries are skipped — pass conditionally-connected services
   * (e.g. a Mongo service that is null when unreachable) without guards.
   */
  services: Record<string, DocumentService<DocumentShape> | null | undefined>;
  /** Mount path (default `/studio`). */
  path?: string;
  /**
   * `standalone` (default) serves a full dashboard page at the mount path;
   * `component` mounts only the JSON API — pair it with the `<Studio />`
   * React component from `@hushkey/studio/component` inside your own
   * dashboard page.
   */
  mode?: "standalone" | "component";
  /**
   * Audit identity stamped on writes made through the studio (default
   * `"studio"`). Receives the context, so it can read your auth state.
   */
  executionerId?: string | ((ctx: StudioContext) => string);
  /**
   * daisyUI style overrides for the dashboard (theme + primary/secondary action
   * classes). Standalone mode applies them automatically.
   */
  style?: StudioStyle;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function err(message: string, status: number): Response {
  return json({ message }, status);
}

// The prebuilt browser bundle (component/bundle.js), read once per process then
// served from memory. Prebuilt at publish (scripts/build_bundle.ts) rather than
// esbuilt on first request: consumed from JSR `import.meta.url` is an `https:`
// URL, which esbuild can neither read a `.tsx` from nor be safely stopped
// against (its service is a process-global singleton shared with the host's dev
// pipeline). `fetch` reads both file:// and https://; `fromFileUrl` throws on
// the latter.
let bundleCache: string | null = null;

async function loadBundle(): Promise<string> {
  if (bundleCache !== null) return bundleCache;
  const url = new URL("./component/bundle.js", import.meta.url);
  bundleCache = url.protocol === "file:"
    ? await Deno.readTextFile(url) // local dev / workspace
    : await (await fetch(url)).text(); // JSR (https)
  return bundleCache;
}

function standaloneHtml(path: string, style?: StudioStyle): string {
  const theme = style?.theme ?? "dark";
  const config = JSON.stringify({ endpoint: `${path}/api`, style });
  // User stylesheets load after daisyUI so they can override it (theme, fonts).
  const userCss = ([] as string[])
    .concat(style?.cssUrl ?? [])
    .map((href) => `<link href="${href}" rel="stylesheet" type="text/css" />`)
    .join("\n");
  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Howl Studio</title>
<!-- daisyUI + Tailwind from CDN — the studio UI is styled entirely with their classes. -->
<link href="https://cdn.jsdelivr.net/npm/daisyui@5" rel="stylesheet" type="text/css" />
<link href="https://cdn.jsdelivr.net/npm/daisyui@5/themes.css" rel="stylesheet" type="text/css" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
${userCss}
<script type="importmap">{"imports":{
  "react":"https://esm.sh/react@18.3.1",
  "react/jsx-runtime":"https://esm.sh/react@18.3.1/jsx-runtime",
  "react-dom/client":"https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1",
  "npm:react@^18.3.1":"https://esm.sh/react@18.3.1",
  "npm:react@^18.3.1/jsx-runtime":"https://esm.sh/react@18.3.1/jsx-runtime",
  "npm:react-dom@^18.3.1/client":"https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1"
}}</script>
<style>
:root{--font-sans:'Inter',ui-sans-serif,system-ui,sans-serif;--font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
html,body{margin:0;font-family:var(--font-sans)}
</style>
</head>
<body class="bg-base-100">
<div id="studio-root"></div>
<script>globalThis.__STUDIO__=${config};</script>
<script type="module" src="${path}/bundle.js"></script>
</body>
</html>`;
}

/**
 * Admin middleware for `@hushkey/service-core` services — one UI over every
 * backend (Mongo, Postgres, SQLite, …), speaking the service contract
 * instead of the wire: writes validate, bump versions, stamp audit fields,
 * and soft delete/restore like any other caller.
 *
 * ```ts
 * app.use(studio({ services: { users, blogs, reviews } }));
 * // → dashboard at /studio, JSON API at /studio/api
 * ```
 *
 * @param options Services to expose plus mount/mode settings.
 * @returns A middleware function (Howl-compatible, framework-light).
 */
export function studio(
  options: StudioOptions,
): (ctx: StudioContext) => Response | Promise<Response> {
  const base = (options.path ?? "/studio").replace(/\/$/, "");
  const mode = options.mode ?? "standalone";
  const services: Record<string, DocumentService<DocumentShape>> = {};
  for (const [key, s] of Object.entries(options.services)) {
    if (s) services[key] = s;
  }

  const who = (ctx: StudioContext): string =>
    typeof options.executionerId === "function"
      ? options.executionerId(ctx)
      : options.executionerId ?? "studio";

  return async (ctx: StudioContext): Promise<Response> => {
    const { pathname } = ctx.url;
    if (pathname !== base && !pathname.startsWith(`${base}/`)) {
      return await ctx.next();
    }
    const rest = pathname.slice(base.length).replace(/^\//, "");
    const method = ctx.req.method;

    try {
      // ── standalone shell ────────────────────────────────────────────
      // no-store: this is an admin tool — a stale cached bundle after an
      // upgrade is worse than refetching ~13KB.
      if (mode === "standalone" && (rest === "" || rest === "index.html") && method === "GET") {
        return new Response(standaloneHtml(base, options.style), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      if (mode === "standalone" && rest === "bundle.js" && method === "GET") {
        return new Response(await loadBundle(), {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }

      // ── JSON API ────────────────────────────────────────────────────
      if (rest === "api/meta" && method === "GET") {
        return json({
          services: Object.entries(services).map(([key, s]) => ({
            key,
            collection: s.collection,
            backend: s.backendKind,
          })),
        });
      }

      const match = rest.match(/^api\/services\/([^/]+)(?:\/([^/]+))?(?:\/(restore))?$/);
      if (match) {
        const [, key, id, action] = match;
        const service = services[key];
        if (!service) return err(`unknown service "${key}"`, 404);

        if (!id && method === "GET") {
          const q = ctx.url.searchParams;
          const filter = q.get("filter") ? JSON.parse(q.get("filter")!) : {};
          const sort = q.get("sort") ? JSON.parse(q.get("sort")!) : undefined;
          const viewDeleted = q.get("deleted") === "true";
          const [docs, total] = await Promise.all([
            service.find({
              query: filter,
              sort,
              limit: Number(q.get("limit") ?? 25),
              skip: Number(q.get("skip") ?? 0),
              viewDeleted,
            }),
            service.count({ query: filter, viewDeleted }),
          ]);
          return json({ data: docs, total });
        }
        if (!id && method === "POST") {
          const body = await ctx.req.json();
          // Multi-insert: an array body inserts each document (Compass-style
          // JSON import) — every one validated and audit-stamped individually.
          if (Array.isArray(body)) {
            const docs = [];
            for (const item of body) {
              docs.push(await service.create(item, { executionerId: who(ctx) }));
            }
            return json({ data: docs, count: docs.length }, 201);
          }
          const doc = await service.create(body, { executionerId: who(ctx) });
          return json({ data: doc }, 201);
        }
        // Bulk operations apply to EVERY document matching the filter (capped
        // at 1000), each through the contract: patch merges + bumps versions,
        // delete soft-deletes unless hard.
        if (id === "bulk-update" && !action && method === "POST") {
          const { filter = {}, patch } = await ctx.req.json();
          if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
            return err("patch object required", 400);
          }
          const matches = await service.find({ query: filter, limit: 1000 });
          for (const doc of matches) {
            await service.patch(doc.id, patch, { executionerId: who(ctx) });
          }
          return json({ count: matches.length });
        }
        if (id === "bulk-delete" && !action && method === "POST") {
          const { filter = {}, hard } = await ctx.req.json();
          const matches = await service.find({ query: filter, limit: 1000 });
          for (const doc of matches) {
            await service.delete(doc.id, { hard: !!hard, executionerId: who(ctx) });
          }
          return json({ count: matches.length });
        }
        // Schema introspection + orphan cleanup. GET lists promoted columns
        // (flagged declared/orphan); POST drops one orphan by name. `supported`
        // is false for backends with no column concept (e.g. Mongo) so the UI
        // can hide the panel.
        if (id === "schema" && !action && method === "GET") {
          const admin = service.schemaAdmin;
          if (!admin) return json({ supported: false, columns: [] });
          return json({ supported: true, columns: await admin.listColumns() });
        }
        if (id === "schema" && !action && method === "POST") {
          const admin = service.schemaAdmin;
          if (!admin) return err("schema admin not supported by this backend", 400);
          const body = await ctx.req.json();

          // Rename/migrate: copy an orphan's data into a declared column THROUGH
          // the contract (each write validates, bumps version, stamps audit),
          // then drop the orphan column AND its leftover JSON key. The copy is
          // top-level only (column name == JSON key); paginated so the whole
          // collection is migrated before the source is dropped.
          if (typeof body.from === "string" && typeof body.to === "string") {
            const { from, to } = body;
            const cols = await admin.listColumns();
            const fromCol = cols.find((c) => c.column === from);
            const toCol = cols.find((c) => c.column === to);
            if (!fromCol || fromCol.declared) {
              return err(`"${from}" must be an orphan column (not in the live config)`, 400);
            }
            if (!toCol || !toCol.declared) {
              return err(`"${to}" must be a declared column`, 400);
            }
            let migrated = 0;
            let skip = 0;
            const BATCH = 500;
            for (;;) {
              // deno-lint-ignore no-explicit-any
              const rows = await service.find({
                query: { [from]: { $exists: true } } as any,
                limit: BATCH,
                skip,
                viewDeleted: true,
              });
              if (rows.length === 0) break;
              for (const d of rows) {
                const value = (d as unknown as Record<string, unknown>)[from];
                if (value === undefined) continue;
                // deno-lint-ignore no-explicit-any
                await service.patch(d.id, { [to]: value } as any, {
                  executionerId: who(ctx),
                  allowDeleted: true,
                });
                migrated++;
              }
              if (rows.length < BATCH) break;
              skip += BATCH;
            }
            await admin.dropColumn(from, { purgeData: true });
            return json({ ok: true, migrated, from, to });
          }

          const { column } = body;
          if (!column || typeof column !== "string") return err("column required", 400);
          await admin.dropColumn(column);
          return json({ ok: true, dropped: column });
        }
        if (id && action === "restore" && method === "POST") {
          const doc = await service.restore(id, { executionerId: who(ctx) });
          if (!doc) return err("not found", 404);
          return json({ data: doc });
        }
        if (id && !action && method === "POST") {
          const body = await ctx.req.json();
          const doc = await service.patch(id, body, { executionerId: who(ctx) });
          if (!doc) return err("not found", 404);
          return json({ data: doc });
        }
        if (id && !action && method === "DELETE") {
          const hard = ctx.url.searchParams.get("hard") === "true";
          const result = await service.delete(id, { hard, executionerId: who(ctx) });
          if (!result) return err("not found", 404);
          return json({ data: result.item, hard: result.hard });
        }
      }

      return err("not found", 404);
    } catch (error) {
      // Validation failures, optimistic-lock conflicts, bad filter JSON —
      // surface the message; the UI renders it inline.
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("Optimistic locking") ? 409 : 400;
      return err(message, status);
    }
  };
}
