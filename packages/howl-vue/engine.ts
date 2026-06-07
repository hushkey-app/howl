import type { Context, RenderEngine, RenderEngineRenderOptions } from "@hushkey/howl";
import { asset, PARTIAL_SEARCH_PARAM } from "@hushkey/howl";
import { type Component, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createHead, renderSSRHead } from "@unhead/vue/server";
import { createPinia, type Pinia } from "pinia";
import * as path from "@std/path";
import { compileSfc, prepareTypeResolution } from "./sfc.ts";
import { composeVueTree } from "./runtime/compose.ts";
import { createRoute, provideRoute } from "./runtime/router.ts";

/** Pin server-side `.vue` page compiles to the same npm packages the engine uses. */
const NPM_VUE = "npm:vue@^3.5.13";
/** `@hushkey/howl-vue/{head,pinia}` are thin re-exports of unhead/pinia; rewrite
 * them to the npm package so a page's import resolves from the SSR data URL. */
const NPM_UNHEAD = "npm:@unhead/vue@^2.0.0";
const NPM_PINIA = "npm:pinia@^2.2.0";
/** `@hushkey/howl-vue/state` is a howl-vue module (the `ctx.state` store), so it
 * rewrites to its `file://` path (not npm) for the SSR data-URL compile. */
const STATE_MOD = new URL("./runtime/state.ts", import.meta.url).href;
/** `@hushkey/howl-vue/router` is a howl-vue module (programmatic navigation +
 * `useRoute`), rewritten to its `file://` path for the SSR data-URL compile. */
const ROUTER_MOD = new URL("./runtime/router.ts", import.meta.url).href;

/** Rewrite a compiled page's imports so they resolve from a `data:` URL module:
 * bare framework specifiers → npm, howl-vue runtime → `file://`, and **relative**
 * imports → absolute `file://` (data URLs have no base, so relative/bare
 * specifiers wouldn't resolve). */
function rewriteForSsr(code: string, fromFile: string): string {
  const dir = path.dirname(fromFile);
  const withFileUrls = code.replace(
    /(\bfrom\s+["'])(\.\.?\/[^"']+)(["'])/g,
    (_m, pre, spec, post) => `${pre}${path.toFileUrl(path.resolve(dir, spec)).href}${post}`,
  );
  return withFileUrls
    .replaceAll('from "vue/server-renderer"', `from "${NPM_VUE}/server-renderer"`)
    .replaceAll("from 'vue/server-renderer'", `from "${NPM_VUE}/server-renderer"`)
    .replaceAll('from "vue"', `from "${NPM_VUE}"`)
    .replaceAll("from 'vue'", `from "${NPM_VUE}"`)
    .replaceAll('from "@hushkey/howl-vue/head"', `from "${NPM_UNHEAD}"`)
    .replaceAll("from '@hushkey/howl-vue/head'", `from "${NPM_UNHEAD}"`)
    .replaceAll('from "@hushkey/howl-vue/pinia"', `from "${NPM_PINIA}"`)
    .replaceAll("from '@hushkey/howl-vue/pinia'", `from "${NPM_PINIA}"`)
    .replaceAll('from "@hushkey/howl-vue/state"', `from "${STATE_MOD}"`)
    .replaceAll("from '@hushkey/howl-vue/state'", `from "${STATE_MOD}"`)
    .replaceAll('from "@hushkey/howl-vue/router"', `from "${ROUTER_MOD}"`)
    .replaceAll("from '@hushkey/howl-vue/router'", `from "${ROUTER_MOD}"`);
}

interface CacheEntry {
  mtime: number;
  comp: Component;
  styles: string[];
}
const SSR_CACHE = new Map<string, CacheEntry>();

/**
 * Compile a `.vue` page for SSR and import it (plus its compiled scoped CSS),
 * cached by file mtime so dev edits recompile. Deno can't import `.vue`
 * directly, so the compiled JS is written to a temp `.ts` (bare `vue` imports
 * rewritten to npm specifiers) and imported.
 */
async function loadSsr(filePath: string): Promise<{ comp: Component; styles: string[] }> {
  const stat = await Deno.stat(filePath);
  const mtime = stat.mtime?.getTime() ?? 0;
  const hit = SSR_CACHE.get(filePath);
  if (hit !== undefined && hit.mtime === mtime) {
    return { comp: hit.comp, styles: hit.styles };
  }

  await prepareTypeResolution();
  const src = await Deno.readTextFile(filePath);
  const { code, styles } = compileSfc(src, filePath, { ssr: true });
  // Import from a `data:` URL rather than a temp file: writing temp files makes
  // Deno's `--watch` (which watches imported modules) restart in a loop. The
  // `npm:vue` specifiers (rewritten by `toNpm`) resolve fine from a data URL.
  const dataUrl = `data:text/typescript,${encodeURIComponent(rewriteForSsr(code, filePath))}`;
  const mod = await import(dataUrl);
  const comp = mod.default as Component;
  SSR_CACHE.set(filePath, { mtime, comp, styles });
  return { comp, styles };
}

/** Inline dev live-reload: reconnects to `/_howl/alive` and reloads when the
 * server (and its build id) restarts — Vue pages don't load Howl's runtime.
 * Backs off reconnects so a `--watch` restart doesn't spam the console. */
function liveReloadScript(base: string): string {
  return `<script>(function(){var r=0,d=250;function c(){try{var w=new WebSocket(` +
    `location.origin.replace(/^http/,"ws")+${JSON.stringify(base)}+"/_howl/alive");` +
    `w.onopen=function(){d=250;};` +
    `w.onmessage=function(e){var m=JSON.parse(e.data);if(m&&m.type==="initial-state"){` +
    `if(r===0){r=m.revision;console.log("%c🐺 Howl%c connected to development server",` +
    `"color:#a855f7;font-weight:bold","color:inherit");}` +
    `else if(r<m.revision){location.reload();}}};` +
    `w.onclose=function(){d=Math.min(d*1.5,2000);setTimeout(c,d);};` +
    `}catch(_){setTimeout(c,1000);}}c();})();</script>`;
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

const PINIA_CACHE = new Map<string, boolean>();

/** Whether `_app.vue` opts into Pinia via a `pinia` attribute on `<body>`. */
async function appUsesPinia(appPath: string): Promise<boolean> {
  const cached = PINIA_CACHE.get(appPath);
  if (cached !== undefined) return cached;
  const src = await Deno.readTextFile(appPath);
  const uses = /<body[^>]*\bpinia\b/i.test(src);
  PINIA_CACHE.set(appPath, uses);
  return uses;
}

/** Insert `content` just before the last occurrence of `closeTag` (or append). */
function injectBefore(html: string, closeTag: string, content: string): string {
  const i = html.lastIndexOf(closeTag);
  return i === -1 ? html + content : html.slice(0, i) + content + html.slice(i);
}

/**
 * Append Howl's build-id cache-bust to local **asset** references so the static
 * middleware serves them `immutable`: `href` on `<link>` (stylesheets, icons)
 * and `src` on `<script>`/`<img>`/`<source>`. Crucially it does **not** touch
 * `<a href>` — those are navigation targets and must stay clean (no
 * `?__howl_c=` leaking into the address bar). Skips `//` (external) and
 * `/_howl/` internals (already build-id pathed; rewriting them would break the
 * modulepreload↔import URL match). Prod only; dev leaves assets un-busted so
 * edits show immediately.
 */
function cacheBustLocalAssets(html: string): string {
  const local = /(\/(?!\/|_howl\/)[^"]*)/;
  return html
    .replace(
      new RegExp(`(<link\\b[^>]*?\\shref=")${local.source}(")`, "gi"),
      (_m, pre, url, post) => `${pre}${asset(url)}${post}`,
    )
    .replace(
      new RegExp(`(<(?:script|img|source)\\b[^>]*?\\ssrc=")${local.source}(")`, "gi"),
      (_m, pre, url, post) => `${pre}${asset(url)}${post}`,
    );
}

/**
 * Props handed to a `.vue` page (and its layouts) on **both** server render and
 * client hydration — a serialisable mirror of the request-scoped
 * {@linkcode Context}. Mirrors Howl's Preact `PageProps` field-for-field so a
 * page reads the same shape under either engine; every value must stay
 * JSON-serialisable so it survives into the hydration payload.
 */
export interface VuePageProps<Data = unknown, State = unknown> {
  /**
   * The layout/page outlet. Preact pages render `<Component />`; Vue layouts use
   * `<slot/>` instead, so this is always `undefined` under Vue — it's kept
   * (optional) only so the prop shape matches the Preact `PageProps`. Optional so
   * Vue doesn't flag it as a missing required prop.
   */
  Component?: undefined;
  /**
   * Request URL (`ctx.url`). A real `URL` on the server **and** the client — the
   * engine serializes it to its href and the client boot revives it — so
   * `url.pathname` / `url.searchParams` work in both passes.
   */
  url: URL;
  /** Matched route params (`ctx.params`). */
  params: Record<string, string>;
  /** Query-string params (`ctx.url.searchParams`, flattened to an object). */
  query: Record<string, string>;
  /** Matched route pattern (`ctx.route`), or `null` when unmatched. */
  route: string | null;
  /** Whether this is a partial render (`ctx.isPartial`; Preact parity). */
  isPartial: boolean;
  /** Request-scoped state (whatever middleware put on `ctx.state`). */
  state: State;
  /** Data returned by the route handler, if any. */
  data: Data;
  /** The caught error when rendering an error page (`_error.vue`); else `null`. */
  error: unknown;
}

/**
 * Shape of a precompiled SSR page module (emitted by Howl's prod build, one per
 * `.vue` route) that `opts.module` carries. Lets the engine render an
 * already-compiled page without reading the `.vue` source — required for
 * `deno compile` binaries.
 */
export interface VueSsrModule {
  /** The `_app.vue` shell component, or `null` when the page has none. */
  app: Component | null;
  /** The `_layout.vue` chain (root → leaf), excluding the page. */
  layouts: Component[];
  /** The page component. */
  page: Component;
  /** Scoped CSS for the whole chain (app first), inlined into the document. */
  styles: string[];
  /** Whether `_app.vue` opted into Pinia via `<body pinia>`. */
  pinia: boolean;
}

function buildProps(ctx: Context<unknown>, opts: RenderEngineRenderOptions): VuePageProps {
  // `Error`/`HttpError` instances don't survive `JSON.stringify` (their fields
  // aren't enumerable), so serialize the bits an error page needs to a plain
  // object — that way SSR and the hydration payload agree.
  const err = ctx.error;
  const error = err == null ? null : {
    status: (err as { status?: number }).status ?? 500,
    message: (err as { message?: string }).message ?? "",
  };

  // `ctx.isPartial` reflects the `howl-partial` marker the client adds to nav
  // fetches; strip it back off the URL the page sees so `url`/`query` stay clean.
  const url = new URL(ctx.url);
  url.searchParams.delete(PARTIAL_SEARCH_PARAM);

  return {
    Component: undefined,
    url,
    params: ctx.params as Record<string, string>,
    query: Object.fromEntries(url.searchParams),
    route: ctx.route,
    isPartial: ctx.isPartial,
    state: ctx.state,
    data: opts.data,
    error,
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
      try {
        const props = buildProps(ctx, opts);
        const base = ctx.config.basePath;

        const propsJson = escapeJsonForScript(JSON.stringify(props));
        const chunkHref = opts.chunkUrl === undefined ? "" : `${base}${opts.chunkUrl}`;
        const hydration = opts.chunkUrl === undefined ? "" : (
          `<script data-howl-vue-props>window.__VUE_PAGE_PROPS__=${propsJson}</script>` +
          `<script type="module" data-howl-vue-page data-chunk="${chunkHref}">` +
          `import(${JSON.stringify(chunkHref)}).then(function(m){m.hydrate();})</script>`
        );
        // AOT manifest (route pattern → client chunk) so the client runtime can
        // render `__`-prefixed routes on nav without a server round-trip.
        const aotScript = opts.aot === undefined || Object.keys(opts.aot).length === 0
          ? ""
          : `<script data-howl-vue-aot>window.__HOWL_VUE_AOT__=${
            escapeJsonForScript(JSON.stringify(prefixManifest(opts.aot, base)))
          }</script>`;
        // Dev-only route map (every Vue route + its ssr/aot/ssg mode), consumed by
        // the Howl Routes DevTools inspector. Omitted entirely in production.
        const vueRoutes = (opts.routes ?? []).filter((r) => r.engine === "vue");
        const routesScript = opts.dev !== true || vueRoutes.length === 0
          ? ""
          : `<script data-howl-vue-routes>window.__HOWL_ROUTES__=${
            escapeJsonForScript(JSON.stringify(vueRoutes))
          }</script>`;
        // Preload the hydration chunk (and, via its static imports, the shared Vue
        // runtime) so the browser fetches it in parallel with parsing the body —
        // the JS is ready the moment hydration kicks off.
        const preload = chunkHref === "" ? "" : `<link rel="modulepreload" href="${chunkHref}">`;
        const live = opts.dev ? liveReloadScript(base) : "";

        // Resolve the page tree two ways: from a precompiled SSR module (prod —
        // required for `deno compile`, no `.vue` on disk), else by compiling the
        // `.vue` source at request time (dev — fast reload). Both yield the
        // `_app.vue` component (or null), the [layouts, page] inner tree, the
        // chain's scoped CSS (app first), and whether `_app.vue` opts into Pinia.
        let appComp: Component | null;
        let innerComps: Component[];
        let styles: string[];
        let usesPinia: boolean;
        const ssrModule = opts.module as VueSsrModule | undefined;
        if (ssrModule !== undefined) {
          appComp = ssrModule.app;
          innerComps = [...ssrModule.layouts, ssrModule.page];
          styles = [...ssrModule.styles];
          usesPinia = ssrModule.pinia;
        } else {
          const { app, layouts } = await discoverVueChain(opts.filePath);
          const innerLoaded = await Promise.all(
            [...layouts, opts.filePath].map(loadSsr),
          );
          innerComps = innerLoaded.map((m) => m.comp);
          styles = innerLoaded.flatMap((m) => m.styles);
          if (app !== null) {
            const appLoaded = await loadSsr(app);
            appComp = appLoaded.comp;
            styles = [...appLoaded.styles, ...styles];
            usesPinia = await appUsesPinia(app);
          } else {
            appComp = null;
            usesPinia = false;
          }
        }

        // `#howl-app` always wraps the hydrated [layouts, page] tree. `_app.vue`
        // is rendered server-side around it but never hydrated, so it can own
        // `<head>`/`<body>` and any static scripts the user wants. Scoped CSS is
        // inlined (no separate request, travels with the client-nav swap).
        const inner = {
          render: composeVueTree(innerComps, { ...props }),
        };

        // Per-page head/SEO: pages call useHead(); collect into a per-request head
        // instance and render it into <head> (with a default title fallback).
        const head = createHead();
        const resolveHeadTags = async () => {
          const ssr = await renderSSRHead(head);
          let headTags = ssr.headTags;
          if (!headTags.includes("<title")) {
            headTags = `<title>${escapeHtml(resolveTitle(props))}</title>${headTags}`;
          }
          return { headTags, bodyTags: ssr.bodyTags };
        };

        let html: string;
        if (appComp !== null) {
          const styleTag = styles.length > 0
            ? `<style data-howl-vue-css>${styles.join("\n")}</style>`
            : "";
          const ssrApp = createSSRApp({
            render: () =>
              h(appComp, { ...props }, {
                default: () => h("div", { id: "howl-app" }, h(inner)),
              }),
          });
          ssrApp.use(head);
          provideRoute(ssrApp, createRoute(props as unknown as Record<string, unknown>));
          // `<body pinia>` → install Pinia and serialize its state for the client.
          let pinia: Pinia | null = null;
          if (usesPinia) {
            pinia = createPinia();
            // Seed the built-in `state` store with ctx.state so `useState()`
            // mirrors the request context (server-rendered + serialized).
            if (props.state !== null && typeof props.state === "object") {
              pinia.state.value.state = props.state as Record<string, unknown>;
            }
            ssrApp.use(pinia);
          }
          const doc = await renderToString(ssrApp);
          const { headTags, bodyTags } = await resolveHeadTags();
          const piniaScript = pinia === null ? "" : (
            `<script data-howl-pinia>window.__PINIA__=${
              escapeJsonForScript(JSON.stringify(pinia.state.value))
            }</script>`
          );
          html = injectBefore(
            doc,
            "</body>",
            piniaScript + aotScript + routesScript + hydration + live + bodyTags,
          );
          html = injectBefore(html, "</head>", preload + styleTag + headTags);
          // `_app.vue` may render a full `<html>` or just `<head>`+`<body>`.
          html = html.includes("<html")
            ? `<!DOCTYPE html>${html}`
            : `<!DOCTYPE html><html lang="en">${html}</html>`;
        } else {
          // No `_app.vue`: Howl provides a minimal shell.
          const styleTag = styles.length > 0
            ? `<style data-howl-vue-css>${styles.join("\n")}</style>`
            : "";
          const ssrApp = createSSRApp(inner);
          ssrApp.use(head);
          provideRoute(ssrApp, createRoute(props as unknown as Record<string, unknown>));
          const appHtml = await renderToString(ssrApp);
          const { headTags, bodyTags } = await resolveHeadTags();
          html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
            `<meta name="viewport" content="width=device-width, initial-scale=1">` +
            `${preload}${styleTag}${headTags}</head>` +
            `<body><div id="howl-app">${appHtml}</div>${aotScript}${routesScript}${hydration}${live}${bodyTags}</body></html>`;
        }

        // In prod, cache-bust user-authored local assets so they're served
        // `immutable`. Dev keeps them un-busted (no-store) for live edits.
        if (opts.dev !== true) html = cacheBustLocalAssets(html);

        const headers = new Headers(opts.headers);
        headers.set("content-type", "text/html; charset=utf-8");
        mergeCtxHeaders(ctx, headers);
        return new Response(html, { status: opts.status, headers });
      } catch (err) {
        // A render failure (bad `.vue`, unresolved import, throw in setup, …) is
        // otherwise swallowed by the segment error handler. Log it, and in dev
        // return a page that shows the actual error + stack so it's debuggable;
        // in prod rethrow so Howl's error handling (`_error.vue`) takes over.
        // deno-lint-ignore no-console
        console.error(`🐺 Vue render failed for ${opts.filePath}:`, err);
        if (opts.dev !== true) throw err;
        const headers = new Headers(opts.headers);
        headers.set("content-type", "text/html; charset=utf-8");
        return new Response(renderDevError(err, opts.filePath), { status: 500, headers });
      }
    },
    async renderToString(component, props) {
      // Standalone render (emails / notifications) — a bare Vue component to
      // markup, no Howl layouts/app shell. Mirrors `ctx.renderToString`.
      return await renderToString(createSSRApp(component as Component, props));
    },
  };
}

/**
 * A minimal dev-only error page showing a Vue render failure's message + stack,
 * so a 500 during SSR is debuggable instead of opaque. Never used in prod.
 */
function renderDevError(err: unknown, filePath: string): string {
  const e = err as { message?: string; stack?: string };
  // The compiled `.vue` is imported from a `data:` URL; a resolution error
  // echoes that whole (huge) URL — collapse it so the real message is readable.
  const clean = (s: string) =>
    s.replace(/data:text\/typescript,[^\s"']+/g, "data:…‹compiled .vue›");
  const message = escapeHtml(clean(e?.message ?? String(err)));
  const stack = escapeHtml(clean(e?.stack ?? ""));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<title>🐺 Vue render error</title><style>` +
    `body{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;` +
    `background:#1e1e2e;color:#cdd6f4;margin:0;padding:2rem}` +
    `h1{color:#f38ba8;font-size:1rem;margin:0 0 .5rem}` +
    `.file{color:#89b4fa;margin-bottom:1rem;word-break:break-all}` +
    `.msg{color:#fab387;font-weight:600;white-space:pre-wrap;margin-bottom:1rem}` +
    `pre{background:#11111b;padding:1rem;border-radius:.5rem;overflow:auto;` +
    `white-space:pre-wrap;word-break:break-word}</style></head><body>` +
    `<h1>Vue render failed</h1><div class="file">${escapeHtml(filePath)}</div>` +
    `<div class="msg">${message}</div><pre>${stack}</pre></body></html>`;
}

/**
 * Merge `ctx.headers` (cookies + any headers middleware/handlers set) into the
 * page's response — mirrors what Howl's Preact `ctx.render` does, so a cookie
 * set in middleware actually ships with a `.vue` page. `Set-Cookie` appends
 * (multiple cookies); everything else overwrites.
 */
function mergeCtxHeaders(ctx: Context<unknown>, headers: Headers): void {
  ctx.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      headers.append(key, value);
    } else {
      headers.set(key, value);
    }
  });
}

/** Prefix each AOT chunk URL with the app's base path (no-op when base is ""). */
function prefixManifest(manifest: Record<string, string>, base: string): Record<string, string> {
  if (base === "") return manifest;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(manifest)) out[k] = `${base}${v}`;
  return out;
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Harden an already-stringified JSON payload for inlining inside a `<script>`:
 * escape `<` (so `</script>` / `<!--` can't break out of the tag) and the
 * U+2028 / U+2029 line separators (legal in JSON strings, but JS parse hazards
 * when emitted verbatim into a script literal).
 */
function escapeJsonForScript(json: string): string {
  return json
    .replaceAll("<", "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
