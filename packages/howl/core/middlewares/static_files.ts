/**
 * @module
 *
 * Static-file middleware entrypoint. Exports {@linkcode staticFiles},
 * which serves files from the project's `static/` directory through
 * the active build cache, with content-hash cache-busting and ETag
 * support.
 */

import type { Middleware } from "./mod.ts";
import { ASSET_CACHE_BUST_KEY, INTERNAL_PREFIX } from "../constants.ts";
import { BUILD_ID } from "../../utils/build-id.ts";
import { isTracingActive, tracer } from "../otel.ts";
import { getBuildCache } from "../context.ts";

/**
 * Brand applied to the {@linkcode staticFiles} middleware so the dev builder
 * can detect — minification-safe, by global-registry symbol rather than
 * function name — whether an app actually serves its static directory. Lets
 * `HowlBuilder` warn when a populated `staticDir` would otherwise go unserved
 * because `app.use(staticFiles())` was never called.
 */
export const STATIC_FILES_MIDDLEWARE: unique symbol = Symbol.for(
  "howl.staticFilesMiddleware",
);

/**
 * Howl middleware to serve static files from the `static/` directory.
 * ```ts
 * // Enable Howl static file serving
 * app.use(staticFiles());
 * ```
 */
export function staticFiles<T>(): Middleware<T> {
  const middleware: Middleware<T> = async function howlServeStaticFiles(ctx) {
    const { req, url, config } = ctx;

    const buildCache = getBuildCache(ctx);
    // deno-lint-ignore no-console

    if (buildCache === null) return await ctx.next();

    let pathname = decodeURIComponent(url.pathname);
    if (config.basePath) {
      pathname = pathname !== config.basePath ? pathname.slice(config.basePath.length) : "/";
    }

    const tracing = isTracingActive();
    const startTime = tracing ? performance.now() + performance.timeOrigin : 0;
    const file = await buildCache.readFile(pathname);

    if (pathname === "/" || file === null) {
      if (pathname === "/favicon.ico") {
        return new Response(null, { status: 404 });
      }
      // Reserved framework namespace — stale clients still request orphaned
      // `/_howl/js/{old-BUILD_ID}/...` chunks after a deploy rotates the build
      // id. Short-circuit with a clean 404 so the request never reaches user
      // middleware (and never produces a noisy error log via DEFAULT_NOT_FOUND).
      if (pathname.startsWith(`${INTERNAL_PREFIX}/`)) {
        return new Response(null, { status: 404 });
      }
      return await ctx.next();
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      file.close();
      return new Response("Method Not Allowed", { status: 405 });
    }

    const span = tracing
      ? tracer.startSpan("static file", {
        attributes: { "howl.span_type": "static_file" },
        startTime,
      })
      : null;

    try {
      const cacheKey = url.searchParams.get(ASSET_CACHE_BUST_KEY);
      if (cacheKey !== null && BUILD_ID !== cacheKey) {
        url.searchParams.delete(ASSET_CACHE_BUST_KEY);
        const location = url.pathname + url.search;
        file.close();
        span?.setAttribute("howl.cache", "invalid_bust_key");
        span?.setAttribute("howl.cache_key", cacheKey);
        return new Response(null, {
          status: 307,
          headers: {
            location,
          },
        });
      }

      const etag = file.hash;
      const headers = new Headers({
        "Content-Type": file.contentType,
        vary: "If-None-Match",
      });

      // In development mode, skip ETag validation to prevent serving stale
      // cached assets when switching between different apps on the same port
      if (ctx.config.mode !== "development") {
        const ifNoneMatch = req.headers.get("If-None-Match");
        if (
          ifNoneMatch !== null &&
          (ifNoneMatch === etag || ifNoneMatch === `W/"${etag}"`)
        ) {
          file.close();
          span?.setAttribute("howl.cache", "not_modified");
          return new Response(null, { status: 304, headers });
        } else if (etag !== null) {
          headers.set("Etag", `W/"${etag}"`);
        }
      }

      if (
        ctx.config.mode !== "development" &&
        (BUILD_ID === cacheKey ||
          url.pathname.startsWith(
            `${ctx.config.basePath}/_howl/js/${BUILD_ID}/`,
          ))
      ) {
        span?.setAttribute("howl.cache", "immutable");
        headers.append("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        span?.setAttribute("howl.cache", "no_cache");
        headers.append(
          "Cache-Control",
          "no-cache, no-store, max-age=0, must-revalidate",
        );
      }

      headers.set("Content-Length", String(file.size));
      if (req.method === "HEAD") {
        file.close();
        return new Response(null, { status: 200, headers });
      }

      // Errors in TS 5.9.2, not sure why
      // deno-lint-ignore no-explicit-any
      return new Response(file.readable as any, { headers });
    } finally {
      span?.end();
    }
  };
  Object.defineProperty(middleware, STATIC_FILES_MIDDLEWARE, { value: true });
  return middleware;
}
