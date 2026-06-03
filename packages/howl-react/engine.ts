import type { Context, RenderEngine, RenderEngineRenderOptions } from "@hushkey/howl";
import { asset, isHttpError, PARTIAL_SEARCH_PARAM } from "@hushkey/howl";
import { renderToString } from "react-dom/server";
import { type ComponentType, createElement, type ReactNode } from "react";
import { createHead, renderSSRHead, UnheadProvider } from "@unhead/react/server";
import { createStore, Provider as JotaiProvider } from "jotai";
import * as path from "@std/path";
import { composeReactTree } from "./runtime/compose.ts";
import { howlStateAtom } from "./runtime/state.ts";

// deno-lint-ignore no-explicit-any
type AnyComponent = ComponentType<any>;

interface CacheEntry {
  mtime: number;
  comp: AnyComponent;
}
const SSR_CACHE = new Map<string, CacheEntry>();

/**
 * Import a `.tsx`/`.jsx` component, cached by file mtime. Unlike `.vue`, Deno
 * transpiles JSX natively, so the source is imported directly (no compile step).
 * `--watch` restarts the dev server on edits, so the in-process cache is fine.
 */
async function loadComponent(filePath: string): Promise<AnyComponent> {
  const stat = await Deno.stat(filePath);
  const mtime = stat.mtime?.getTime() ?? 0;
  const hit = SSR_CACHE.get(filePath);
  if (hit !== undefined && hit.mtime === mtime) return hit.comp;
  const mod = await import(path.toFileUrl(filePath).href);
  const comp = mod.default as AnyComponent;
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

interface ReactChain {
  app: string | null;
  layouts: string[];
}
const CHAIN_CACHE = new Map<string, ReactChain>();

/**
 * Shape of a precompiled SSR page module (emitted by Howl's prod build, one per
 * `.tsx` route) carried in `opts.module`. Lets the engine render from statically
 * imported components — required for `deno compile` (no `.tsx` source on disk).
 */
interface ReactSsrModule {
  /** The `_app.tsx` document shell component, or `null` if the route has none. */
  app: AnyComponent | null;
  /** The `_layout.tsx` chain (outer → inner). */
  layouts: AnyComponent[];
  /** The page component. */
  page: AnyComponent;
}

/**
 * Discover a page's wrapper chain: walk up from its directory collecting
 * `_layout.tsx` at each level (inner → outer), stopping at the first `_app.tsx`.
 */
async function discoverReactChain(pageFilePath: string): Promise<ReactChain> {
  const cached = CHAIN_CACHE.get(pageFilePath);
  if (cached !== undefined) return cached;

  const layouts: string[] = [];
  let appPath: string | null = null;
  let dir = path.dirname(pageFilePath);
  for (let depth = 0; depth < 16; depth++) {
    const layout = path.join(dir, "_layout.tsx");
    if (await fileExists(layout)) layouts.unshift(layout);
    const app = path.join(dir, "_app.tsx");
    if (await fileExists(app)) {
      appPath = app;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const chain: ReactChain = { app: appPath, layouts };
  CHAIN_CACHE.set(pageFilePath, chain);
  return chain;
}

/**
 * Props passed to a React page (and its layouts/app) — a serialisable mirror of
 * the request-scoped {@linkcode Context}.
 */
export interface ReactPageProps<Data = unknown, State = unknown> {
  /** Request URL. */
  url: URL;
  /** Matched route params. */
  params: Record<string, string>;
  /** Query-string params. */
  query: Record<string, string>;
  /** Request-scoped state (`ctx.state`). */
  state: State;
  /** Data returned by the route handler, if any. */
  data: Data;
  /** Matched route pattern (`ctx.route`), or `null`. */
  route: string | null;
  /** Whether this is a client-nav (partial) request (`ctx.isPartial`). */
  isPartial: boolean;
  /** Serialized error on an error page (`_error.tsx`); else `null`. */
  error: unknown;
  /** Layout/app outlet — render `<Component />` to place the nested page. */
  Component?: ComponentType;
}

function buildProps(
  ctx: Context<unknown>,
  opts: RenderEngineRenderOptions,
): ReactPageProps {
  // `Error` instances don't survive `JSON.stringify`; serialize the bits an
  // error page needs so SSR and the hydration payload agree.
  const err = ctx.error;
  const error = err == null ? null : {
    status: (err as { status?: number }).status ?? 500,
    message: (err as { message?: string }).message ?? "",
  };
  // `ctx.isPartial` reflects the `howl-partial` marker client-nav adds; strip it
  // back off the URL the page sees.
  const url = new URL(ctx.url);
  url.searchParams.delete(PARTIAL_SEARCH_PARAM);

  return {
    url,
    params: ctx.params as Record<string, string>,
    query: Object.fromEntries(url.searchParams),
    state: ctx.state,
    data: opts.data,
    route: ctx.route,
    isPartial: ctx.isPartial,
    error,
  };
}

/**
 * Merge `ctx.headers` (cookies + middleware-set headers) into the page response
 * — mirrors Howl's Preact `ctx.render`. `Set-Cookie` appends; others overwrite.
 */
function mergeCtxHeaders(ctx: Context<unknown>, headers: Headers): void {
  ctx.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") headers.append(key, value);
    else headers.set(key, value);
  });
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

/** Inline dev live-reload: reconnects to `/_howl/alive` and reloads when the
 * server (and its build id) restarts — React pages don't load Howl's runtime.
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

/** Prefix every chunk URL in an AOT manifest with `base` (no-op when empty). */
function prefixManifest(
  manifest: Record<string, string>,
  base: string,
): Record<string, string> {
  if (base === "") return manifest;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(manifest)) out[k] = `${base}${v}`;
  return out;
}

/** Escape the five HTML-significant characters for safe text interpolation. */
function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Dev-only page shown when a `.tsx` render throws (bad import, runtime error in
 * a component, …) — surfaces the real message + stack so it's debuggable instead
 * of the generic `_error.tsx`. Intentional {@link HttpError}s bypass this and
 * route to `_error.tsx`; prod rethrows. */
function renderDevError(err: unknown, filePath: string): string {
  const e = err as { message?: string; stack?: string };
  const message = escapeHtml(e?.message ?? String(err));
  const stack = escapeHtml(e?.stack ?? "");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<title>🐺 React render error</title><style>` +
    `body{font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;` +
    `background:#1e1e2e;color:#cdd6f4;margin:0;padding:2rem}` +
    `h1{color:#f38ba8;font-size:1rem;margin:0 0 .5rem}` +
    `.file{color:#89b4fa;margin-bottom:1rem;word-break:break-all}` +
    `.msg{color:#fab387;font-weight:600;white-space:pre-wrap;margin-bottom:1rem}` +
    `pre{background:#11111b;padding:1rem;border-radius:.5rem;overflow:auto;` +
    `white-space:pre-wrap;word-break:break-word}</style></head><body>` +
    `<h1>React render failed</h1><div class="file">${escapeHtml(filePath)}</div>` +
    `<div class="msg">${message}</div><pre>${stack}</pre></body></html>`;
}

/** Options for {@linkcode reactEngine}. */
export interface ReactEngineOptions {
  /** Fallback document `<title>` when no page calls `useHead({ title })`.
   * Defaults to `state.title` or "Howl". */
  title?: (props: ReactPageProps) => string;
}

/**
 * Howl render engine for React `.tsx` pages. Register the engine + its plugin:
 *
 * ```ts
 * new Howl({ engines: { react: reactEngine() } });
 * // dev.ts: new HowlBuilder(app, { plugins: [reactPlugin()] });
 * ```
 *
 * `_app.tsx` (if present) owns the whole document; the `[…Layouts, Page]` tree
 * renders inside a `#howl-app` div, hydrated on the client from the page chunk.
 * Pages call `useHead()` (`@hushkey/howl-react/head`) for per-page `<title>` /
 * meta — SSR'd here and kept reactive across client navs by the boot runtime.
 */
export function reactEngine(options: ReactEngineOptions = {}): RenderEngine<Context<unknown>> {
  const resolveTitle = options.title ??
    ((p: ReactPageProps) => (p.state as { title?: string })?.title ?? "Howl");

  return {
    async render(ctx, opts) {
      try {
        const props = buildProps(ctx, opts);
        const base = ctx.config.basePath;

        // Resolve the page tree two ways: from a precompiled SSR module (prod —
        // required for `deno compile`, no `.tsx` on disk), else by importing the
        // `.tsx` source at request time (dev — fast reload via `--watch`).
        let appComp: AnyComponent | null;
        let innerComps: AnyComponent[];
        const ssrModule = opts.module as ReactSsrModule | undefined;
        if (ssrModule !== undefined) {
          appComp = ssrModule.app;
          innerComps = [...ssrModule.layouts, ssrModule.page];
        } else {
          const { app, layouts } = await discoverReactChain(opts.filePath);
          innerComps = await Promise.all([...layouts, opts.filePath].map(loadComponent));
          appComp = app !== null ? await loadComponent(app) : null;
        }

        const inner = composeReactTree(innerComps, { ...props });

        // Client hydration: serialise the props and import the page chunk, which
        // calls its exported `hydrate()`.
        const propsJson = JSON.stringify(props, (_k, v) => v instanceof URL ? v.href : v)
          .replaceAll("<", "\\u003c");
        const chunkHref = opts.chunkUrl === undefined ? "" : `${base}${opts.chunkUrl}`;
        const hydration = opts.chunkUrl === undefined ? "" : (
          `<script data-howl-react-props>window.__REACT_PAGE_PROPS__=${propsJson}</script>` +
          `<script type="module" data-howl-react-page data-chunk="${chunkHref}">` +
          `import(${JSON.stringify(chunkHref)}).then(function(m){m.hydrate();})</script>`
        );
        // AOT manifest (route pattern → client chunk) so the client runtime can
        // render `__`/`___`-prefixed routes on nav without a server round-trip.
        const aotScript = opts.aot === undefined || Object.keys(opts.aot).length === 0
          ? ""
          : `<script data-howl-react-aot>window.__HOWL_REACT_AOT__=${
            JSON.stringify(prefixManifest(opts.aot, base)).replaceAll("<", "\\u003c")
          }</script>`;
        const preload = chunkHref === "" ? "" : `<link rel="modulepreload" href="${chunkHref}">`;
        const live = opts.dev ? liveReloadScript(base) : "";

        // Per-request unhead instance — collects every page/layout `useHead()` call
        // during render, then serialises to `<head>` tags (with a title fallback).
        const head = createHead();
        // Per-request jotai store — seeded with `ctx.state` so `useHowlState()` and
        // user atoms render server-side without leaking across concurrent requests.
        const store = createStore();
        store.set(howlStateAtom, (props.state ?? {}) as Record<string, unknown>);
        const withProviders = (node: ReactNode): ReactNode =>
          createElement(
            JotaiProvider,
            { store },
            createElement(
              UnheadProvider as ComponentType<{ value: unknown; children: ReactNode }>,
              { value: head, children: node },
            ),
          );
        const resolveHeadTags = async (): Promise<string> => {
          const ssr = await renderSSRHead(head);
          return ssr.headTags.includes("<title")
            ? ssr.headTags
            : `<title>${escapeHtml(resolveTitle(props))}</title>${ssr.headTags}`;
        };

        let html: string;
        if (appComp !== null) {
          const appNode = createElement(appComp, {
            ...props,
            Component: () => createElement("div", { id: "howl-app" }, inner),
          });
          let doc = renderToString(withProviders(appNode));
          if (!doc.includes("<html")) doc = `<html lang="en">${doc}</html>`;
          const headTags = await resolveHeadTags();
          doc = injectBefore(doc, "</head>", preload + headTags);
          doc = injectBefore(doc, "</body>", aotScript + hydration + live);
          html = `<!DOCTYPE html>${doc}`;
        } else {
          const appHtml = renderToString(
            withProviders(createElement("div", { id: "howl-app" }, inner)),
          );
          const headTags = await resolveHeadTags();
          html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
            `<meta name="viewport" content="width=device-width, initial-scale=1">` +
            `${preload}${headTags}</head>` +
            `<body>${appHtml}${aotScript}${hydration}${live}</body></html>`;
        }

        // Prod: cache-bust local asset refs (`<link href>` / `<img src>`) so the
        // static middleware serves them `immutable`. Dev leaves them un-busted so
        // edits show immediately.
        if (opts.dev !== true) html = cacheBustLocalAssets(html);

        const headers = new Headers(opts.headers);
        headers.set("content-type", "text/html; charset=utf-8");
        mergeCtxHeaders(ctx, headers);
        return new Response(html, { status: opts.status, headers });
      } catch (err) {
        // A render failure (unresolved import, throw in a component, …) is
        // otherwise swallowed by the segment error handler. An intentional
        // `HttpError` (e.g. a 404) should still route to `_error.tsx`, so
        // rethrow it; in prod rethrow everything. In dev, return a page that
        // surfaces the real error + stack so it's debuggable.
        if (isHttpError(err) || opts.dev !== true) throw err;
        // deno-lint-ignore no-console
        console.error(`🐺 React render failed for ${opts.filePath}:`, err);
        const headers = new Headers(opts.headers);
        headers.set("content-type", "text/html; charset=utf-8");
        return new Response(renderDevError(err, opts.filePath), { status: 500, headers });
      }
    },
    renderToString(component, props) {
      // Standalone render (emails / notifications) — a bare React component to
      // markup, no Howl layouts/app shell. Mirrors `ctx.renderToString`.
      return renderToString(createElement(component as ComponentType, props ?? undefined));
    },
  };
}
