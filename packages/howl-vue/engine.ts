import type { Context, RenderEngine, RenderEngineRenderOptions } from "@hushkey/howl";
import { asset } from "@hushkey/howl/runtime";
import { type Component, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createHead, renderSSRHead } from "@unhead/vue/server";
import { createPinia, type Pinia } from "pinia";
import * as path from "@std/path";
import { compileSfc } from "./sfc.ts";
import { composeVueTree } from "./runtime/compose.ts";

/** Pin server-side `.vue` page compiles to the same npm packages the engine uses. */
const NPM_VUE = "npm:vue@^3.5.13";
/** `@hushkey/howl-vue/{head,pinia}` are thin re-exports of unhead/pinia; rewrite
 * them to the npm package so a page's import resolves from the SSR data URL. */
const NPM_UNHEAD = "npm:@unhead/vue@^2.0.0";
const NPM_PINIA = "npm:pinia@^2.2.0";

/** Rewrite a compiled page's imports so they resolve from a `data:` URL module:
 * bare framework specifiers → npm, and **relative** imports → absolute `file://`
 * (data URLs have no base, so relative/bare specifiers wouldn't resolve). */
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
    .replaceAll("from '@hushkey/howl-vue/pinia'", `from "${NPM_PINIA}"`);
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
 * Append Howl's build-id cache-bust to local `href`/`src` assets (e.g. a
 * `<link href="/style.css">` in `_app.vue`) so the static middleware serves
 * them `immutable`. Skips `/_howl/` internals — those are already build-id
 * pathed, and rewriting them would break the modulepreload↔import URL match.
 * Prod only; in dev assets stay un-busted so edits show immediately.
 */
function cacheBustLocalAssets(html: string): string {
  return html.replace(
    /\b(href|src)="(\/(?!\/|_howl\/)[^"]*)"/g,
    (_m, attr, url) => `${attr}="${asset(url)}"`,
  );
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
      const chunkHref = opts.chunkUrl === undefined ? "" : `${base}${opts.chunkUrl}`;
      const hydration = opts.chunkUrl === undefined ? "" : (
        `<script data-howl-vue-props>window.__VUE_PAGE_PROPS__=${propsJson}</script>` +
        `<script type="module" data-howl-vue-page data-chunk="${chunkHref}">` +
        `import(${JSON.stringify(chunkHref)}).then(function(m){m.hydrate();})</script>`
      );
      // Preload the hydration chunk (and, via its static imports, the shared Vue
      // runtime) so the browser fetches it in parallel with parsing the body —
      // the JS is ready the moment hydration kicks off.
      const preload = chunkHref === "" ? "" : `<link rel="modulepreload" href="${chunkHref}">`;
      const live = opts.dev ? liveReloadScript(base) : "";

      // `#howl-app` always wraps the hydrated [layouts, page] tree. `_app.vue`
      // is rendered server-side around it but never hydrated, so it can own
      // `<head>`/`<body>` and any static scripts the user wants.
      const innerLoaded = await Promise.all(
        [...layouts, opts.filePath].map(loadSsr),
      );
      const inner = {
        render: composeVueTree(innerLoaded.map((m) => m.comp), { ...props }),
      };
      // Scoped CSS for the whole chain, inlined into the document (no separate
      // request, no stale-chunk 404s, and it travels with the client-nav swap).
      const styles = innerLoaded.flatMap((m) => m.styles);

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
      if (app !== null) {
        const appLoaded = await loadSsr(app);
        styles.unshift(...appLoaded.styles);
        const appComp = appLoaded.comp;
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
        // `<body pinia>` → install Pinia and serialize its state for the client.
        let pinia: Pinia | null = null;
        if (await appUsesPinia(app)) {
          pinia = createPinia();
          ssrApp.use(pinia);
        }
        const doc = await renderToString(ssrApp);
        const { headTags, bodyTags } = await resolveHeadTags();
        const piniaScript = pinia === null ? "" : (
          `<script>window.__PINIA__=${
            JSON.stringify(pinia.state.value).replaceAll("<", "\\u003c")
          }</script>`
        );
        html = injectBefore(doc, "</body>", piniaScript + hydration + live + bodyTags);
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
        const appHtml = await renderToString(ssrApp);
        const { headTags, bodyTags } = await resolveHeadTags();
        html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width, initial-scale=1">` +
          `${preload}${styleTag}${headTags}</head>` +
          `<body><div id="howl-app">${appHtml}</div>${hydration}${live}${bodyTags}</body></html>`;
      }

      // In prod, cache-bust user-authored local assets so they're served
      // `immutable`. Dev keeps them un-busted (no-store) for live edits.
      if (opts.dev !== true) html = cacheBustLocalAssets(html);

      const headers = new Headers(opts.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(html, { status: opts.status, headers });
    },
  };
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
