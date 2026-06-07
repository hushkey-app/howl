/**
 * @module
 *
 * Public entrypoint for `@hushkey/howl`. Exports the core application
 * primitives — the {@linkcode Howl} class, {@linkcode Context}, the
 * built-in middleware barrel, the cookie manager, page/route types,
 * islands utilities ({@linkcode ClientOnly}, environment guards), the
 * built-in {@linkcode HowlLogger}, configuration types, and
 * shared HTTP helpers including {@linkcode HttpError} and
 * {@linkcode isHttpError}.
 *
 * Use this module to construct an app, define routes/middleware, and
 * compose the Howl runtime. Build pipeline lives in `@hushkey/howl/dev`,
 * the typed API layer in `@hushkey/howl/api`.
 */

// =============================================================================
// @hushkey/howl — Public API
// =============================================================================

// --- Framework entry point ---
export { getBuildCache, Howl, type HowlOptions, type ListenOptions, setBuildCache } from "./app.ts";

// --- Request context ---
export { Context, type SSEEvent } from "./context.ts";

// --- Page props ---
export type { PageProps } from "./render.ts";

// --- Cookies ---
export { CookieManager, type CookieOptions } from "./cookies.ts";

// --- Middleware ---
export { staticFiles } from "./middlewares/static_files.ts";
export { type CoalesceOptions, coalesceRequests } from "./middlewares/coalesce.ts";
export type { MaybeLazyMiddleware, Middleware } from "./middlewares/mod.ts";

// --- Environment guards ---
export { IS_BROWSER, IS_SERVER } from "./guards.ts";

// --- Logger ---
export { HowlLogger, type LoggerOptions } from "./logger.ts";

// --- HTTP errors ---
export { type ErrorStatus, HttpError, isHttpError } from "./error.ts";

// --- HTTP method literal union ---
export type { Method } from "./router.ts";

// --- Types ---
export type { LayoutConfig, Lazy, MaybeLazy, Route, RouteConfig } from "./types.ts";

// --- Config ---
export { type HowlConfig, parseDirPath, type ResolvedHowlConfig } from "./config.ts";
export type { EngineRouteInfo, RenderEngine, RenderEngineRenderOptions } from "./engine.ts";
export { asset, assetSrcSet } from "./asset.ts";

// --- Constants ---
export {
  ALIVE_URL,
  ASSET_CACHE_BUST_KEY,
  DAY,
  DEV_ERROR_OVERLAY_URL,
  HOUR,
  INTERNAL_PREFIX,
  MINUTE,
  PARTIAL_SEARCH_PARAM,
  SECOND,
  TEST_FILE_PATTERN,
  UPDATE_INTERVAL,
  WEEK,
} from "./constants.ts";

// --- Internals used by @howl/dev (not public API) ---
export { type FsAdapter, fsAdapter } from "./fs.ts";
export { assertInDir, pathToExportName, pathToSpec, UniqueNamer } from "./utils.ts";
export { type BuildCache, IslandPreparer, ProdBuildCache, type StaticFile } from "./build_cache.ts";
export { fsItemsToCommands, type FsRouteFile } from "./fs_routes.ts";
export { type Command, CommandType } from "./commands.ts";

export { type Island, type ServerIslandRegistry } from "./context.ts";
export type { ApiConfig, ClientConfig, WebSocketHandlers, WebSocketUpgradeOptions } from "./app.ts";
