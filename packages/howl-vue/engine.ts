import type { Context, RenderEngine, RenderEngineRenderOptions } from "@hushkey/howl";
import { asset, PARTIAL_SEARCH_PARAM } from "@hushkey/howl";
import { type Component, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createHead, renderSSRHead } from "@unhead/vue/server";
import { createPinia, type Pinia } from "pinia";
import * as path from "@std/path";
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

/** A static `import …`/`export … from "spec"` **statement** in compiled SFC
 * code. Anchored on the `import`/`export` keyword at a statement boundary and
 * forbidding backticks before `from`, so it matches real imports (including
 * the `vue/server-renderer` import that template-only components emit *after*
 * `const __sfc__ = {}`) without ever matching a `from "…"` that appears inside
 * an HTML template literal in the render function. Group 1 captures everything
 * up to and including `from `; group 2 is the specifier — the quote characters
 * are dropped so the rewrite can re-emit double quotes (see
 * {@linkcode compileVueDataUrl}). */
const IMPORT_RE = /((?:^|[\n;])\s*(?:import|export)\b[^`]*?\bfrom\s+)["']([^"'\n]+)["']/g;

/** Framework + howl-vue runtime specifiers pinned to fixed targets so the SSR
 * `data:`-URL module shares the engine's **exact** runtime instances — a
 * second `vue` instance would mismatch `renderToString`. Takes precedence over
 * the project import map (which may list a different `vue` version). */
const FRAMEWORK_SPECIFIERS: Record<string, string> = {
  "vue": NPM_VUE,
  "vue/server-renderer": `${NPM_VUE}/server-renderer`,
  "@hushkey/howl-vue/head": NPM_UNHEAD,
  "@hushkey/howl-vue/pinia": NPM_PINIA,
  "@hushkey/howl-vue/state": STATE_MOD,
  "@hushkey/howl-vue/router": ROUTER_MOD,
};

/** A specifier that already carries its own scheme — resolvable from a `data:`
 * URL without an import-map base. */
const QUALIFIED_SPECIFIER = /^(?:npm:|jsr:|node:|https?:|file:|data:)/;

/** Resolved `imports` for a project, merged from every `deno.json(c)` on the
 * path from a page's dir up to the filesystem root (nearer config wins).
 * Relative targets are pre-resolved to `file://` against their own config's
 * directory, so a lookup yields a directly usable specifier. Cached per dir. */
const IMPORT_MAP_CACHE = new Map<string, Promise<Record<string, string>>>();

function loadProjectImports(startDir: string): Promise<Record<string, string>> {
  const cached = IMPORT_MAP_CACHE.get(startDir);
  if (cached !== undefined) return cached;
  const promise = (async () => {
    const { parse: parseJsonc } = await import("@std/jsonc");
    const merged: Record<string, string> = {};
    let dir = startDir;
    for (let depth = 0; depth < 32; depth++) {
      for (const name of ["deno.json", "deno.jsonc"]) {
        let text: string;
        try {
          text = await Deno.readTextFile(path.join(dir, name));
        } catch {
          continue;
        }
        let cfg: { imports?: Record<string, string> };
        try {
          cfg = parseJsonc(text) as { imports?: Record<string, string> };
        } catch {
          continue;
        }
        for (const [key, value] of Object.entries(cfg.imports ?? {})) {
          if (key in merged) continue; // a nearer config already defined it
          merged[key] = value.startsWith(".") || value.startsWith("/")
            ? path.toFileUrl(path.resolve(dir, value)).href
            : value;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return merged;
  })();
  IMPORT_MAP_CACHE.set(startDir, promise);
  return promise;
}

/** Resolve a bare specifier against a project import map: exact key, else the
 * longest trailing-slash prefix key (`@std/` matches `@std/path`). */
function resolveFromImports(spec: string, imports: Record<string, string>): string | null {
  const exact = imports[spec];
  if (exact !== undefined) return exact;
  let best: string | null = null;
  for (const key of Object.keys(imports)) {
    if (key.endsWith("/") && spec.startsWith(key) && (best === null || key.length > best.length)) {
      best = key;
    }
  }
  return best === null ? null : imports[best] + spec.slice(best.length);
}

/** A `.vue` file compiled to an importable `data:` URL, plus its transitive
 * scoped CSS, cached by mtime within the process. */
interface DataUrlEntry {
  mtime: number;
  dataUrl: string;
  styles: string[];
}
const DATA_URL_CACHE = new Map<string, DataUrlEntry>();

/**
 * Resolve a single import specifier from a compiled `.vue` for the SSR
 * `data:`-URL module, recursively compiling `.vue` targets and accumulating
 * their styles into `childStyles`.
 *
 * - Relative `.vue` → its own recursive `data:` URL (Deno has no `.vue` loader,
 *   so a `file://` would fail with "Unknown module"); relative anything-else →
 *   absolute `file://`.
 * - Already-qualified (`npm:`/`jsr:`/`file:`/…) → unchanged.
 * - Framework/runtime specifier → its instance-sharing pin.
 * - Otherwise resolved against the project import map (honouring the user's own
 *   remaps); an unknown bare specifier is left as-is so Deno surfaces a clear
 *   "not in import map" error instead of a silent miss.
 */
async function resolveSsrSpecifier(
  spec: string,
  dir: string,
  imports: Record<string, string>,
  visiting: Set<string>,
  childStyles: string[],
): Promise<string> {
  const resolveLocal = async (abs: string): Promise<string> => {
    if (!abs.endsWith(".vue")) return path.toFileUrl(abs).href;
    if (visiting.has(abs)) return path.toFileUrl(abs).href; // cycle guard
    visiting.add(abs);
    const child = await compileVueDataUrl(abs, visiting);
    visiting.delete(abs);
    childStyles.push(...child.styles);
    return child.dataUrl;
  };

  if (spec.startsWith("./") || spec.startsWith("../")) {
    return await resolveLocal(path.resolve(dir, spec));
  }
  if (QUALIFIED_SPECIFIER.test(spec)) return spec;
  const framework = FRAMEWORK_SPECIFIERS[spec];
  if (framework !== undefined) return framework;
  const mapped = resolveFromImports(spec, imports);
  if (mapped === null) return spec;
  return mapped.startsWith("file://") && mapped.endsWith(".vue")
    ? await resolveLocal(path.fromFileUrl(mapped))
    : mapped;
}

/**
 * Compile a `.vue` file — and, recursively, every `.vue` child component it
 * imports — into an importable `data:` URL for SSR. Returns the transitive
 * scoped CSS (this file first, then its children) so the engine can inline a
 * child component's styles into the SSR document.
 *
 * Import specifiers are rewritten so the `data:`-URL module (which has no
 * import-map base) resolves: see {@linkcode resolveSsrSpecifier}. Only genuine
 * `import`/`export … from` statements are matched (see {@linkcode IMPORT_RE}) —
 * never a `from "…"` inside an HTML string literal in the render function.
 * Cached per file by mtime; dev `--watch` restarts the whole process on any
 * edit, so the in-process cache never goes stale. `visiting` guards against
 * import cycles.
 */
async function compileVueDataUrl(
  filePath: string,
  visiting: Set<string>,
): Promise<{ dataUrl: string; styles: string[] }> {
  const stat = await Deno.stat(filePath);
  const mtime = stat.mtime?.getTime() ?? 0;
  const hit = DATA_URL_CACHE.get(filePath);
  if (hit !== undefined && hit.mtime === mtime) {
    return { dataUrl: hit.dataUrl, styles: hit.styles };
  }

  // The SFC compiler is only needed on this dev path (prod renders from
  // precompiled SSR modules) — import it lazily so a production server never
  // loads `@vue/compiler-sfc` at startup.
  const { compileSfc } = await import("./sfc.ts");
  const src = await Deno.readTextFile(filePath);
  const { code, styles } = compileSfc(src, filePath, { ssr: true });

  const dir = path.dirname(filePath);
  const imports = await loadProjectImports(dir);
  const childStyles: string[] = [];
  const replacement = new Map<string, string>();
  for (const [, , spec] of code.matchAll(IMPORT_RE)) {
    if (replacement.has(spec)) continue;
    replacement.set(spec, await resolveSsrSpecifier(spec, dir, imports, visiting, childStyles));
  }
  // Always re-emit **double** quotes: a resolved specifier is npm:/jsr:/file://
  // or a `data:` URL from `encodeURIComponent`, none of which can contain a raw
  // `"` (encodeURIComponent escapes it to `%22`) — but a nested `data:` URL can
  // contain a raw `'` (encodeURIComponent leaves `'` intact), which would
  // terminate a single-quoted specifier early.
  const rewritten = code.replace(IMPORT_RE, (_m, pre, spec) => `${pre}"${replacement.get(spec)}"`);

  // Import from a `data:` URL rather than a temp file: writing temp files makes
  // Deno's `--watch` (which watches imported modules) restart in a loop.
  const dataUrl = `data:text/typescript,${encodeURIComponent(rewritten)}`;
  // Child styles come after this file's own so a child's scoped CSS can't
  // shadow the parent's; dedupe identical blocks (a shared child imported twice).
  const allStyles = [...new Set([...styles, ...childStyles])];
  DATA_URL_CACHE.set(filePath, { mtime, dataUrl, styles: allStyles });
  return { dataUrl, styles: allStyles };
}

interface CacheEntry {
  mtime: number;
  comp: Component;
  styles: string[];
}
const SSR_CACHE = new Map<string, CacheEntry>();

/**
 * Compile a `.vue` page for SSR and import it (plus its transitive scoped CSS),
 * cached by file mtime so dev edits recompile. Deno can't import `.vue`
 * directly, so the page (and any `.vue` children) compile to `data:` URLs via
 * {@linkcode compileVueDataUrl} before importing.
 */
async function loadSsr(filePath: string): Promise<{ comp: Component; styles: string[] }> {
  const stat = await Deno.stat(filePath);
  const mtime = stat.mtime?.getTime() ?? 0;
  const hit = SSR_CACHE.get(filePath);
  if (hit !== undefined && hit.mtime === mtime) {
    return { comp: hit.comp, styles: hit.styles };
  }

  const { prepareTypeResolution } = await import("./sfc.ts");
  await prepareTypeResolution();
  const { dataUrl, styles } = await compileVueDataUrl(filePath, new Set([filePath]));
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

/** Per-module render artefacts derived once from an immutable prod SSR module. */
interface PreparedSsrModule {
  /** The `[…layouts, page]` chain handed to `composeVueTree`. */
  innerComps: Component[];
  /** The chain's scoped CSS joined into a single inline `<style>` tag. */
  styleTag: string;
}
const PREPARED_SSR_MODULES = new WeakMap<object, PreparedSsrModule>();

/** Inline `<style>` tag for a page chain's scoped CSS (empty when no styles). */
function styleTagFor(styles: string[]): string {
  return styles.length > 0 ? `<style data-howl-vue-css>${styles.join("\n")}</style>` : "";
}

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
const LOCAL_ASSET = /(\/(?!\/|_howl\/)[^"]*)/;
const LINK_HREF_RE = new RegExp(`(<link\\b[^>]*?\\shref=")${LOCAL_ASSET.source}(")`, "gi");
const MEDIA_SRC_RE = new RegExp(
  `(<(?:script|img|source)\\b[^>]*?\\ssrc=")${LOCAL_ASSET.source}(")`,
  "gi",
);

function cacheBustLocalAssets(html: string): string {
  return html
    .replace(LINK_HREF_RE, (_m, pre, url, post) => `${pre}${asset(url)}${post}`)
    .replace(MEDIA_SRC_RE, (_m, pre, url, post) => `${pre}${asset(url)}${post}`);
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
        let styleTag: string;
        let usesPinia: boolean;
        const ssrModule = opts.module as VueSsrModule | undefined;
        if (ssrModule !== undefined) {
          // The module is immutable after a prod build — derive the inner
          // component chain and the joined style tag once per module, not per
          // request.
          let prepared = PREPARED_SSR_MODULES.get(ssrModule);
          if (prepared === undefined) {
            prepared = {
              innerComps: [...ssrModule.layouts, ssrModule.page],
              styleTag: styleTagFor(ssrModule.styles),
            };
            PREPARED_SSR_MODULES.set(ssrModule, prepared);
          }
          appComp = ssrModule.app;
          innerComps = prepared.innerComps;
          styleTag = prepared.styleTag;
          usesPinia = ssrModule.pinia;
        } else {
          const { app, layouts } = await discoverVueChain(opts.filePath);
          const innerLoaded = await Promise.all(
            [...layouts, opts.filePath].map(loadSsr),
          );
          innerComps = innerLoaded.map((m) => m.comp);
          let styles = innerLoaded.flatMap((m) => m.styles);
          if (app !== null) {
            const appLoaded = await loadSsr(app);
            appComp = appLoaded.comp;
            styles = [...appLoaded.styles, ...styles];
            usesPinia = await appUsesPinia(app);
          } else {
            appComp = null;
            usesPinia = false;
          }
          styleTag = styleTagFor(styles);
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
const SCRIPT_HAZARD_RE = /[<\u2028\u2029]/g;
const SCRIPT_HAZARD_MAP: Record<string, string> = {
  "<": "\\u003c",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

function escapeJsonForScript(json: string): string {
  return json.replace(SCRIPT_HAZARD_RE, (ch) => SCRIPT_HAZARD_MAP[ch]);
}
