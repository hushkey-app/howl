import type { Context, RenderEngine, RenderEngineRenderOptions } from "@hushkey/howl";
import { type Component, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import * as path from "@std/path";
import { compileSfc } from "./sfc.ts";
import { composeVueTree } from "./runtime/compose.ts";

/** Pin server-side `.vue` page compiles to the same npm Vue the engine uses. */
const NPM_VUE = "npm:vue@^3.5.13";

function toNpm(code: string): string {
  return code
    .replaceAll('from "vue/server-renderer"', `from "${NPM_VUE}/server-renderer"`)
    .replaceAll("from 'vue/server-renderer'", `from "${NPM_VUE}/server-renderer"`)
    .replaceAll('from "vue"', `from "${NPM_VUE}"`)
    .replaceAll("from 'vue'", `from "${NPM_VUE}"`);
}

interface CacheEntry {
  mtime: number;
  comp: Component;
}
const SSR_CACHE = new Map<string, CacheEntry>();

/**
 * Compile a `.vue` page for SSR and import it, cached by file mtime so dev edits
 * recompile. Deno can't import `.vue` directly, so the compiled JS is written to
 * a temp `.ts` (bare `vue` imports rewritten to npm specifiers) and imported.
 */
async function loadSsrComponent(filePath: string): Promise<Component> {
  const stat = await Deno.stat(filePath);
  const mtime = stat.mtime?.getTime() ?? 0;
  const hit = SSR_CACHE.get(filePath);
  if (hit !== undefined && hit.mtime === mtime) return hit.comp;

  const src = await Deno.readTextFile(filePath);
  const { code } = compileSfc(src, filePath, { ssr: true });
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, toNpm(code));
  const mod = await import(`file://${tmp}`);
  const comp = mod.default as Component;
  SSR_CACHE.set(filePath, { mtime, comp });
  return comp;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** A page's wrapper chain: an optional `_app.vue` plus ordered `_layout.vue`s. */
export interface VueChain {
  /** `_app.vue` path if present — owns the whole `<html>` document. */
  app: string | null;
  /** `_layout.vue` paths, outer → inner; hydrated inside `#howl-app`. */
  layouts: string[];
}

const CHAIN_CACHE = new Map<string, VueChain>();

/**
 * Discover a page's wrapper chain by walking up from its directory: collect a
 * `_layout.vue` at each level (inner → outer), and stop at the first `_app.vue`
 * (the pages root). Bounded by the filesystem root.
 */
export async function discoverVueChain(pageFilePath: string): Promise<VueChain> {
  const cached = CHAIN_CACHE.get(pageFilePath);
  if (cached !== undefined) return cached;

  const layouts: string[] = [];
  let appPath: string | null = null;
  let dir = path.dirname(pageFilePath);
  for (let depth = 0; depth < 16; depth++) {
    const layout = path.join(dir, "_layout.vue");
    if (await fileExists(layout)) layouts.unshift(layout);
    const app = path.join(dir, "_app.vue");
    if (await fileExists(app)) {
      appPath = app;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const chain: VueChain = { app: appPath, layouts };
  CHAIN_CACHE.set(pageFilePath, chain);
  return chain;
}

/** Insert `content` just before the last occurrence of `closeTag` (or append). */
function injectBefore(html: string, closeTag: string, content: string): string {
  const i = html.lastIndexOf(closeTag);
  return i === -1 ? html + content : html.slice(0, i) + content + html.slice(i);
}

/**
 * Props handed to a `.vue` page on both server render and client hydration.
 * Must stay JSON-serialisable so the same values survive into the hydration
 * payload.
 */
export interface VuePageProps {
  /** Current pathname. */
  url: string;
  /** Matched route params. */
  params: Record<string, string>;
  /** Request-scoped state (whatever middleware put on `ctx.state`). */
  state: unknown;
  /** Data returned by the route handler, if any. */
  data: unknown;
}

function buildProps(ctx: Context<unknown>, opts: RenderEngineRenderOptions): VuePageProps {
  return {
    url: ctx.url.pathname,
    params: ctx.params as Record<string, string>,
    state: ctx.state,
    data: opts.data,
  };
}

/**
 * Options for {@linkcode vueEngine}.
 */
export interface VueEngineOptions {
  /** Document `<title>` resolver. Defaults to `state.client.title` or "Howl". */
  title?: (props: VuePageProps) => string;
}

/**
 * Howl render engine for full Vue pages. Registered as
 * `new Howl({ engines: { vue: vueEngine() } })`; `.vue` routes are then
 * server-rendered by Vue (crawlable SEO HTML) and hydrated on the client.
 *
 * First paint is SSR; the client hydration chunk (built by Howl when a
 * `.vue` page is present) takes over into a live Vue app.
 */
export function vueEngine(options: VueEngineOptions = {}): RenderEngine<Context<unknown>> {
  const resolveTitle = options.title ??
    ((p: VuePageProps) => (p.state as { client?: { title?: string } })?.client?.title ?? "Howl");

  return {
    async render(ctx, opts) {
      const { app, layouts } = await discoverVueChain(opts.filePath);
      const props = buildProps(ctx, opts);
      const base = ctx.config.basePath;

      const propsJson = JSON.stringify(props).replaceAll("<", "\\u003c");
      const cssLink = opts.cssUrl === undefined
        ? ""
        : `<link rel="stylesheet" href="${base}${opts.cssUrl}">`;
      const hydration = opts.chunkUrl === undefined ? "" : (
        `<script>window.__VUE_PAGE_PROPS__=${propsJson}</script>` +
        `<script type="module" src="${base}${opts.chunkUrl}"></script>`
      );

      // `#howl-app` always wraps the hydrated [layouts, page] tree. `_app.vue`
      // is rendered server-side around it but never hydrated, so it can own
      // `<head>`/`<body>` and any static scripts the user wants.
      const innerComps = await Promise.all(
        [...layouts, opts.filePath].map(loadSsrComponent),
      );
      const inner = { render: composeVueTree(innerComps, { ...props }) };

      let html: string;
      if (app !== null) {
        // `_app.vue` owns the whole document; render it with the inner tree as
        // its slot, then inject Howl's CSS link + hydration into its head/body.
        const appComp = await loadSsrComponent(app);
        const doc = await renderToString(
          createSSRApp({
            render: () =>
              h(appComp, { ...props }, {
                default: () => h("div", { id: "howl-app" }, h(inner)),
              }),
          }),
        );
        html = injectBefore(doc, "</body>", hydration);
        html = injectBefore(html, "</head>", cssLink);
        // `_app.vue` may render a full `<html>` or just `<head>`+`<body>`.
        html = html.includes("<html")
          ? `<!DOCTYPE html>${html}`
          : `<!DOCTYPE html><html lang="en">${html}</html>`;
      } else {
        // No `_app.vue`: Howl provides a minimal shell.
        const appHtml = await renderToString(createSSRApp(inner));
        const title = resolveTitle(props);
        html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width, initial-scale=1">` +
          `<title>${escapeHtml(title)}</title>${cssLink}</head>` +
          `<body><div id="howl-app">${appHtml}</div>${hydration}</body></html>`;
      }

      const headers = new Headers(opts.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(html, { status: opts.status, headers });
    },
  };
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
