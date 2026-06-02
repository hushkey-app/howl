import type { AnyComponent } from "preact";
import type { MaybeLazy, Route, RouteConfig } from "./types.ts";
import type { HandlerByMethod, RouteHandler } from "./handlers.ts";
import type { Middleware } from "./middlewares/mod.ts";
import type { AsyncAnyComponent, PageProps } from "./render.ts";
import { type HandlerFn, isHandlerByMethod } from "./handlers.ts";
import {
  type Command,
  CommandType,
  newAppCmd,
  newErrorCmd,
  newLayoutCmd,
  newMiddlewareCmd,
  newNotFoundCmd,
  newRouteCmd,
} from "./commands.ts";
import { isLazy } from "./utils.ts";
import { recordSpanError, tracer } from "./otel.ts";

/**
 * Shape of a route/middleware/layout file loaded from the file system.
 */
export interface HowlFsMod<State> {
  /** Optional route configuration. */
  config?: RouteConfig;
  /** Single handler function or array of handler functions. */
  handler?: RouteHandler<unknown, State> | HandlerFn<unknown, State>[];
  /** Per-method handler map. */
  handlers?: RouteHandler<unknown, State>;
  /** Default export — the page/layout/middleware component. */
  default?:
    | AnyComponent<PageProps<unknown, State>>
    | AsyncAnyComponent<PageProps<unknown, State>>;
  /** CSS asset URLs to preload alongside the route. */
  css?: string[];
}

/**
 * Internal representation of a single file collected from the routes
 * directory by the FS crawler.
 */
export interface FsRouteFile<State> {
  /** Stable identifier (typically the relative file path). */
  id: string;
  /** Absolute path on disk. */
  filePath: string;
  /** Module export (or a lazy loader). */
  mod: MaybeLazy<HowlFsMod<State>>;
  /** URL pattern derived from the file path. */
  pattern: string;
  /** Command type (route, middleware, layout, app, error, not-found). */
  type: CommandType;
  /** Pattern used for OpenAPI/route registration purposes. */
  routePattern: string;
  /** Optional configuration override declared on the file. */
  overrideConfig: RouteConfig | undefined;
  /** CSS assets emitted by the build for this route. */
  css: string[];
  /** Render-engine name for non-Preact routes (e.g. `"vue"` for `.vue` pages). */
  engine?: string;
  /** Marks an engine route as AOT (client-rendered on in-app navigation). */
  aot?: boolean;
  /** Marks an engine route for static-site generation (prerendered at build). */
  ssg?: boolean;
}

function isHowlFile<State>(
  // deno-lint-ignore no-explicit-any
  mod: any,
  commandType: CommandType,
): mod is HowlFsMod<State> {
  if (mod === null || typeof mod !== "object") return false;

  return typeof mod.default === "function" ||
    commandType === CommandType.Middleware && Array.isArray(mod.default) ||
    typeof mod.config === "object" || typeof mod.handlers === "object" ||
    typeof mod.handlers === "function" || typeof mod.handler === "object" ||
    typeof mod.handler === "function";
}

/**
 * Options accepted by the file-system route loader.
 */
export interface FsRoutesOptions {
  /**
   * Parent directory for the `/routes` and `/islands` folders.
   *
   * By default, the `root` config option of the provided app is used.
   * @default app.config.root
   */
  dir?: string;
  /** Regular expressions matched against file paths to skip during the crawl. */
  ignoreFilePattern?: RegExp[];
  /** Callback used to dynamically import a route module by absolute path. */
  loadRoute: (path: string) => Promise<unknown>;
}

/**
 * Convert collected {@linkcode FsRouteFile}s into the internal command list
 * consumed by the router.
 */
export function fsItemsToCommands<State>(
  items: FsRouteFile<State>[],
): Command<State>[] {
  const commands: Command<State>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { filePath, type, mod: rawMod, pattern, routePattern } = item;

    // Engine-owned `_app.vue` / `_layout.vue` are resolved by the render engine
    // straight from the filesystem; they're not registered as Howl commands.
    // Engine `_error.vue` (CommandType.Error) IS registered below — it renders
    // through the engine like a page when an error is caught.
    if (
      item.engine !== undefined &&
      type !== CommandType.Route &&
      type !== CommandType.Error
    ) {
      continue;
    }

    switch (type) {
      case CommandType.Middleware: {
        if (isLazy(rawMod)) continue;
        const { handlers, mod } = validateFsMod(filePath, rawMod, type);

        let middlewares = (handlers ?? mod.default) as unknown as
          | Middleware<State>
          | Middleware<State>[]
          | HandlerByMethod<unknown, State> ??
          null;
        if (middlewares === null) continue;

        if (isHandlerByMethod(middlewares)) {
          warnInvalidRoute(
            `Middleware does not support object handlers with GET, POST, etc. in ${filePath}`,
          );
          continue;
        }

        if (!Array.isArray(middlewares)) {
          middlewares = [middlewares];
        }

        commands.push(newMiddlewareCmd(pattern, middlewares, true));
        continue;
      }
      case CommandType.Layout: {
        const { handlers, mod } = validateFsMod<State>(filePath, rawMod, type);
        if (handlers !== null) {
          warnInvalidRoute("Layout does not support handlers");
        }
        if (!mod.default) continue;

        commands.push(newLayoutCmd(pattern, mod.default, mod.config, true));
        continue;
      }
      case CommandType.Error: {
        // Engine error page (e.g. `_error.vue`) — rendered by the render engine
        // from the filesystem, no importable Preact component.
        if (item.engine !== undefined) {
          const engineConfig: RouteConfig = { methods: "ALL" };
          commands.push(newErrorCmd(
            pattern,
            { engine: item.engine, filePath, config: engineConfig },
            true,
          ));
          continue;
        }
        const { handlers, mod } = validateFsMod<State>(filePath, rawMod, type);
        commands.push(newErrorCmd(
          pattern,
          {
            component: mod.default ?? undefined,
            config: mod.config ?? undefined,
            // deno-lint-ignore no-explicit-any
            handler: (handlers as any) ?? undefined,
          },
          true,
        ));
        continue;
      }
      case CommandType.NotFound: {
        const { handlers, mod } = validateFsMod<State>(filePath, rawMod, type);
        commands.push(newNotFoundCmd({
          config: mod.config,
          component: mod.default,
          // deno-lint-ignore no-explicit-any
          handler: handlers as any ?? undefined,
        }));
        continue;
      }
      case CommandType.App: {
        const { mod } = validateFsMod<State>(filePath, rawMod, type);
        if (mod.default === undefined) continue;

        commands.push(newAppCmd(mod.default));
        continue;
      }
      case CommandType.Route: {
        // Engine-owned routes (e.g. `.vue` pages) carry no Preact component —
        // the render engine loads + renders the file at request time.
        if (item.engine !== undefined) {
          const engineConfig: RouteConfig = {
            methods: item.overrideConfig?.methods ?? "ALL",
            routeOverride: routePattern,
          };
          commands.push(
            newRouteCmd(
              pattern,
              { engine: item.engine, filePath, config: engineConfig },
              engineConfig,
              false,
            ),
          );
          continue;
        }

        let normalized;
        // Merge configs
        let config: RouteConfig = {};
        if (isLazy(rawMod)) {
          normalized = async () => {
            return await tracer.startActiveSpan("lazy-route", {
              attributes: { "howl.route_name": rawMod.name ?? "anonymous" },
            }, async (span) => {
              try {
                const result = await rawMod();
                return normalizeRoute(filePath, result, routePattern, type);
              } catch (err) {
                recordSpanError(span, err);
                throw err;
              } finally {
                span.end();
              }
            });
          };

          config.methods = item.overrideConfig?.methods ?? "ALL";
          config.routeOverride = item.overrideConfig?.routeOverride ??
            routePattern;
        } else {
          normalized = normalizeRoute(filePath, rawMod, routePattern, type);
          if (rawMod.config) {
            config = rawMod.config;
          }
        }

        commands.push(
          newRouteCmd(pattern, normalized, config, false),
        );
        continue;
      }
      case CommandType.Handler:
        throw new Error(`Not supported`);
      case CommandType.FsRoute:
        throw new Error(`Nested FsRoutes are not supported`);
      default:
        throw new Error(`Unknown command type: ${type}`);
    }
  }

  return commands;
}

function warnInvalidRoute(message: string) {
  // deno-lint-ignore no-console
  console.warn(
    `🍋 %c[WARNING] Unsupported route config: ${message}`,
    "color:rgb(251, 184, 0)",
  );
}

const APP_REG = /_app(?!\.[tj]sx?)?$/;

/**
 * Sort route paths where special Howl files like `_app`,
 * `_layout` and `_middleware` are sorted in front.
 */
export function sortRoutePaths(a: string, b: string) {
  // The `_app` route should always be the first
  if (APP_REG.test(a)) return -1;
  else if (APP_REG.test(b)) return 1;

  const aLen = a.length;
  const bLen = b.length;

  let segment = false;
  let aIdx = 0;
  let bIdx = 0;
  for (; aIdx < aLen && bIdx < bLen; aIdx++, bIdx++) {
    const charA = a.charAt(aIdx);
    const charB = b.charAt(bIdx);

    // When comparing a grouped route with a non-grouped one, we
    // need to skip over the group name to effectively compare the
    // actual route.
    if (charA === "(" && charB !== "(") {
      if (charB == "[") return -1;
      return 1;
    } else if (charB === "(" && charA !== "(") {
      if (charA == "[") return 1;
      return -1;
    }

    if (charA === "/" || charB === "/") {
      segment = true;

      // If the other path doesn't close the segment
      // then we don't need to continue
      if (charA !== "/") return 1;
      if (charB !== "/") return -1;

      continue;
    }

    if (segment) {
      segment = false;

      const scoreA = getRoutePathScore(charA, a, aIdx);
      const scoreB = getRoutePathScore(charB, b, bIdx);
      if (scoreA === scoreB) {
        if (charA !== charB) {
          // TODO: Do we need localeSort here or is this good enough?
          return charA < charB ? 0 : 1;
        }
        continue;
      }

      return scoreA > scoreB ? -1 : 1;
    }

    if (charA !== charB) {
      // TODO: Do we need localeSort here or is this good enough?
      return charA < charB ? 0 : 1;
    }

    // If we're at the end of A or B, then we assume that the longer
    // path is more specific
    if (aIdx === aLen - 1 && bIdx < bLen - 1) {
      return 1;
    } else if (bIdx === bLen - 1 && aIdx < aLen - 1) {
      return -1;
    }
  }

  return 0;
}

/**
 * Assign a score based on the first two characters of a path segment.
 * The goal is to sort `_middleware` and `_layout` in front of everything
 * and `[` or `[...` last respectively.
 */
function getRoutePathScore(char: string, s: string, i: number): number {
  if (char === "_") {
    if (i + 1 < s.length) {
      if (s[i + 1] === "e") return 4;
      if (s[i + 1] === "m") return 6;
    }
    return 5;
  } else if (char === "[") {
    if (i + 1 < s.length && s[i + 1] === ".") {
      return 0;
    }
    return 1;
  }

  if (
    i + 4 === s.length - 1 && char === "i" && s[i + 1] === "n" &&
    s[i + 2] === "d" && s[i + 3] === "e" && s[i + 4] === "x"
  ) {
    return 3;
  }

  return 2;
}

export function validateFsMod<State>(
  filePath: string,
  mod: unknown,
  commandType: CommandType,
): {
  handlers: RouteHandler<unknown, State> | HandlerFn<unknown, State>[] | null;
  mod: HowlFsMod<State>;
} {
  if (!isHowlFile<State>(mod, commandType)) {
    throw new Error(
      `Expected a route, middleware, layout or error template, but couldn't find relevant exports in: ${filePath}`,
    );
  }

  const handlers = mod.handlers ?? mod.handler ?? null;
  if (typeof handlers === "function" && handlers.length > 1) {
    throw new Error(
      `Handlers must only have one argument but found more than one. Check the function signature in: ${filePath}`,
    );
  }

  return { handlers, mod };
}

function normalizeRoute<State>(
  filePath: string,
  rawMod: HowlFsMod<State>,
  routePattern: string,
  commandType: CommandType,
): Route<State> {
  const { handlers, mod } = validateFsMod<State>(filePath, rawMod, commandType);

  return {
    config: {
      ...mod.config,
      routeOverride: mod.config?.routeOverride ?? routePattern,
    },
    // deno-lint-ignore no-explicit-any
    handler: (handlers as any) ?? undefined,
    component: mod.default,
    css: rawMod.css,
  };
}
