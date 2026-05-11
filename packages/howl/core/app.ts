import { trace } from "@opentelemetry/api";
import { DENO_DEPLOYMENT_ID } from "../utils/build-id.ts";
import * as colors from "@std/fmt/colors";
import type { MaybeLazyMiddleware, Middleware } from "./middlewares/mod.ts";
import { Context } from "./context.ts";
import { mergePath, type Method, UrlPatternRouter } from "./router.ts";
import type { HowlConfig, ResolvedHowlConfig } from "./config.ts";
import type { BuildCache } from "./build_cache.ts";
import { isHttpError } from "./error.ts";
import { STATUS_TEXT } from "@std/http/status";
import type { LayoutConfig, MaybeLazy, Route, RouteConfig } from "./types.ts";
import type { RouteComponent } from "./segments.ts";
import {
  type ApiRouteCommand,
  applyCommands,
  type Command,
  CommandType,
  DEFAULT_NOT_ALLOWED_METHOD,
  DEFAULT_NOT_FOUND,
  newAppCmd,
  newErrorCmd,
  newHandlerCmd,
  newLayoutCmd,
  newMiddlewareCmd,
  newNotFoundCmd,
  newRouteCmd,
} from "./commands.ts";
import { MockBuildCache } from "./test_utils.ts";
import { HowlLogger, type LoggerOptions } from "./logger.ts";
import { ALIVE_URL, PARTIAL_SEARCH_PARAM } from "./constants.ts";
/**
 * Configuration for a registered client app — an isolated build of routes/islands
 * mounted at a path.
 */
export interface ClientConfig {
  /** Unique client name; used as the build cache namespace. */
  name: string;
  /** Absolute or root-relative directory containing the client's pages/islands. */
  dir: string;
  /** URL path the client is mounted at (e.g. `/`, `/admin`). */
  mount: string;
}

/**
 * Configuration for the file-system API route loader.
 */
export interface ApiConfig {
  /** Directory (absolute or root-relative) to crawl for `*.api.ts` files. */
  dir: string;
  /** URL prefix prepended to inferred API paths (e.g. `/api`). */
  prefix: string;
  /** Whether to expose the generated OpenAPI spec endpoint. */
  spec?: boolean;
}

/**
 * Lifecycle handlers registered on a WebSocket endpoint via {@linkcode Howl.ws}.
 * Each callback receives the upgraded {@linkcode WebSocket} plus the
 * {@linkcode Context} from the upgrading request, so middleware-set state
 * (auth, request id, etc.) is available without re-parsing.
 */
export interface WebSocketHandlers<State> {
  /** Fires once the connection is open. */
  open?(socket: WebSocket, ctx: Context<State>): void;
  /** Fires on every inbound frame. */
  message?(socket: WebSocket, event: MessageEvent, ctx: Context<State>): void;
  /** Fires when the connection closes (clean or unclean). */
  close?(
    socket: WebSocket,
    code: number,
    reason: string,
    ctx: Context<State>,
  ): void;
  /** Fires on protocol/transport errors. */
  error?(socket: WebSocket, event: Event, ctx: Context<State>): void;
}

/**
 * Options accepted by {@linkcode Howl.ws}. Extends Deno's
 * {@linkcode Deno.UpgradeWebSocketOptions} with a `port` for binding the
 * endpoint to a separate `Deno.serve` listener.
 */
export interface WebSocketUpgradeOptions extends Deno.UpgradeWebSocketOptions {
  /**
   * If set, the WS endpoint is exposed **only** on this port — not on the
   * main app port. {@linkcode Howl.listen} automatically spawns a second
   * `Deno.serve` for it, sharing the same middleware pipeline so auth and
   * `ctx.state` work identically. Non-WS routes return 404 on this port.
   *
   * Useful when the WS endpoint should scale or terminate TLS independently
   * from the rest of the HTTP surface.
   */
  port?: number;
  /**
   * Optional hostname for the secondary listener. Defaults to the main app's
   * hostname (or `0.0.0.0`).
   */
  hostname?: string;
}

// deno-lint-ignore no-explicit-any
export const DEFAULT_CONN_INFO: any = {
  localAddr: { transport: "tcp", hostname: "localhost", port: 8080 },
  remoteAddr: { transport: "tcp", hostname: "localhost", port: 1234 },
};

const defaultOptionsHandler = (methods: string[]): () => Promise<Response> => {
  return () =>
    Promise.resolve(
      new Response(null, {
        status: 204,
        headers: { Allow: methods.join(", ") },
      }),
    );
};

// deno-lint-ignore require-await
const DEFAULT_ERROR_HANDLER = async <State>(ctx: Context<State>) => {
  const { error } = ctx;
  const where = `${ctx.req.method} ${ctx.url.pathname}${ctx.url.search}`;
  if (isHttpError(error)) {
    if (error.status >= 500) {
      // deno-lint-ignore no-console
      console.error(`[${error.status}] ${where}`, error);
    } else if (error.status >= 400) {
      // deno-lint-ignore no-console
      console.warn(`[${error.status}] ${where}`);
    }
    return new Response(error.message || STATUS_TEXT[error.status], {
      status: error.status,
    });
  }
  // deno-lint-ignore no-console
  console.error(`[500] ${where}`, error);
  return new Response("Internal server error", { status: 500 });
};

function getNetworkIp(): string | null {
  try {
    const ifaces = Deno.networkInterfaces();
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.address.startsWith("127.")) {
        return iface.address;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Options accepted by {@linkcode Howl.listen}.
 *
 * Mirrors `Deno.ServeTcpOptions` (and optional TLS key/cert) plus an optional
 * `remoteAddress` string used purely for the dev-server startup banner.
 */
export type ListenOptions =
  & Partial<Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem>
  & {
    /** Optional remote URL printed on startup (informational only). */
    remoteAddress?: string;
  };

function createOnListen(
  basePath: string,
  options: ListenOptions,
): (localAddr: Deno.NetAddr) => void {
  return (params) => {
    if (DENO_DEPLOYMENT_ID) return;

    const pathname = basePath + "/";
    const protocol = "key" in options && options.key && options.cert ? "https:" : "http:";

    let hostname = params.hostname;
    if (
      Deno.build.os === "windows" &&
      (hostname === "0.0.0.0" || hostname === "::")
    ) {
      hostname = "localhost";
    }
    hostname = hostname.startsWith("::") ? `[${hostname}]` : hostname;

    const address = colors.rgb24(
      `${protocol}//${hostname}:${params.port}${pathname}`,
      0xbf00ff,
    );
    const networkIp = getNetworkIp();

    // deno-lint-ignore no-console
    // console.log();
    // deno-lint-ignore no-console
    // console.log(Deno.env.toObject());
    console.info(
      colors.bgRgb24(colors.rgb24(`${colors.bold(" HOWL ")}`, 0xffffff), 0xbf00ff),
    );
    // deno-lint-ignore no-console
    console.info(`${colors.bold("Local:")}   ${address} ${colors.dim("← Server")}`);
    if (networkIp) {
      // deno-lint-ignore no-console
      console.info(
        `${colors.bold("Network:")} ${
          colors.rgb24(
            `${protocol}//${networkIp}:${params.port}${pathname}`,
            0xbf00ff,
          )
        }  ${colors.dim("← phone/tablet")}`,
      );
    }
    if (options.remoteAddress) {
      // deno-lint-ignore no-console
      console.log(
        `${colors.bold("Remote:")}   ${colors.rgb24(options.remoteAddress, 0xbf00ff)}`,
      );
    }
    // deno-lint-ignore no-console
    // console.log();
  };
}

function listenOnFreePort(
  options: ListenOptions,
  handler: (request: Request, info?: Deno.ServeHandlerInfo) => Promise<Response>,
) {
  let firstError = null;
  for (let port = 8000; port < 8020; port++) {
    try {
      return Deno.serve({ ...options, port }, handler);
    } catch (err) {
      if (err instanceof Deno.errors.AddrInUse) {
        if (!firstError) firstError = err;
        continue;
      }
      throw err;
    }
  }
  throw firstError;
}

/** @internal Returns the {@linkcode BuildCache} attached to a Howl app, or `null`. */
export let getBuildCache: <State>(app: Howl<State>) => BuildCache<State> | null;
/** @internal Attaches a {@linkcode BuildCache} to a Howl app and locks the run mode. */
export let setBuildCache: <State>(
  app: Howl<State>,
  cache: BuildCache<State>,
  mode: "development" | "production",
) => void;
/** @internal Installs an error interceptor invoked when a middleware throws. */
export let setErrorInterceptor: <State>(
  app: Howl<State>,
  fn: (err: unknown) => void,
) => void;

const NOOP = () => {};

/**
 * Constructor options for {@linkcode Howl}.
 *
 * Extends the resolved {@linkcode HowlConfig} (basePath, mode, root) with
 * optional per-app logger settings.
 */
export interface HowlOptions extends HowlConfig {
  /**
   * Enable Howl's built-in logger.
   * Adds timestamp and PID to all console output.
   * @default false
   */
  logger?: boolean;
  /**
   * Enable debug logging. No-ops when false.
   * @default false
   */
  debug?: boolean;
  /**
   * Custom logger options — ignored if logger: false.
   */
  loggerOptions?: LoggerOptions;
}

/**
 * The Howl application — single unified class for routing,
 * middleware, server startup, and framework configuration.
 *
 * @example
 * ```ts
 * import { Howl } from "@hushkey/howl";
 *
 * const app = new Howl({ mode: "production", logger: true });
 *
 * app.get("/api/ping", (ctx) => ctx.json({ ok: true }));
 * app.fsClientRoutes();
 *
 * export default { fetch: app.handler() };
 * ```
 */
// deno-lint-ignore no-explicit-any
export class Howl<State = any> {
  #clients: ClientConfig[] = [];
  #getBuildCache: () => BuildCache<State> | null = () => null;
  #commands: Command<State>[] = [];
  /** Maps a port to the set of WS paths bound to it (port-isolated). */
  #wsPortRoutes: Map<number, { hostname?: string; paths: Set<string> }> = new Map();
  #onError: (err: unknown) => void = NOOP;
  #logger: HowlLogger | null = null;
  #apiRoutesEnabled = false;
  #apiConfig: unknown = null;
  #apiRouteCmd: ApiRouteCommand<State> | null = null;
  /**
   * Cached handler closures keyed by `boundPort` (`-1` represents the main
   * listener). Built lazily on first {@linkcode handler} call and reused
   * thereafter to avoid rebuilding the router/segment tree.
   */
  #handlerCache: Map<number, (req: Request, info?: Deno.ServeHandlerInfo) => Promise<Response>> =
    new Map();
  #frozen = false;

  #assertMutable(method: string): void {
    if (this.#frozen) {
      throw new Error(
        `Howl.${method}() called after handler() was built. Register all routes and middleware before requesting the handler.`,
      );
    }
  }

  static {
    getBuildCache = (app) => app.#getBuildCache();
    setBuildCache = (app, cache, mode: "development" | "production") => {
      app.config.root = cache.root;
      app.config.mode = mode;
      app.#getBuildCache = () => cache;
    };
    setErrorInterceptor = (app, fn) => {
      app.#onError = fn;
    };
  }

  /** The resolved Howl configuration. */
  config: ResolvedHowlConfig;

  /** Access the logger instance directly. */
  get logger(): HowlLogger | null {
    return this.#logger;
  }

  /** Create a new Howl application. */
  constructor(options: HowlOptions = {}) {
    this.config = {
      root: ".",
      basePath: options.basePath ?? "",
      mode: options.mode ?? "production",
    };

    if (options.logger) {
      this.#logger = new HowlLogger({
        debug: options.debug,
        ...options.loggerOptions,
      });
      this.#logger.install();
    }
  }

  /**
   * Configure the app with a callback.
   * Useful for modular setup. If the callback returns a Promise the
   * call returns `Promise<this>` so it can be awaited; otherwise it
   * returns `this` synchronously.
   *
   * @example
   * app.configure((app) => {
   *   app.use(staticFiles());
   *   app.use(authMiddleware);
   * });
   *
   * @example
   * await app.configure(async (app) => {
   *   await db.connect();
   *   app.use(authMiddleware);
   * });
   */
  configure(fn: (app: this) => Promise<void>): Promise<this>;
  configure(fn: (app: this) => void): this;
  configure(
    fn: (app: this) => void | Promise<void>,
  ): this | Promise<this> {
    const result = fn(this);
    if (result instanceof Promise) return result.then(() => this);
    return this;
  }

  /**
   * Add one or more middlewares at the root or specified path.
   *
   * @example
   * app.use(authMiddleware);
   * app.use("/admin", adminOnly);
   */
  use(...middleware: MaybeLazyMiddleware<State>[]): this;
  /** Register middleware scoped to a path pattern. */
  use(path: string, ...middleware: MaybeLazyMiddleware<State>[]): this;
  use(
    pathOrMiddleware: string | MaybeLazyMiddleware<State>,
    ...middlewares: MaybeLazyMiddleware<State>[]
  ): this {
    let pattern: string;
    let fns: MaybeLazyMiddleware<State>[];
    if (typeof pathOrMiddleware === "string") {
      pattern = pathOrMiddleware;
      fns = middlewares!;
    } else {
      pattern = "*";
      middlewares.unshift(pathOrMiddleware);
      fns = middlewares;
    }
    // Trailing /* and /** collapse to the parent segment so the middleware
    // attaches one level up and propagates to every descendant route via the
    // segment-walk in segmentToMiddlewares. Bare "*" / "/*" stay as-is and
    // map to the root segment.
    if (pattern.length > 2 && (pattern.endsWith("/*") || pattern.endsWith("/**"))) {
      pattern = pattern.endsWith("/**") ? pattern.slice(0, -3) : pattern.slice(0, -2);
      if (pattern === "") pattern = "/";
    }
    this.#assertMutable("use");
    this.#commands.push(newMiddlewareCmd(pattern, fns, true));
    return this;
  }

  /** Set a custom 404 handler. */
  notFound(routeOrMiddleware: Route<State> | Middleware<State>): this {
    this.#assertMutable("notFound");
    this.#commands.push(newNotFoundCmd(routeOrMiddleware));
    return this;
  }

  /** Set an error handler at a specific path. */
  onError(
    path: string,
    routeOrMiddleware: Route<State> | Middleware<State>,
  ): this {
    this.#assertMutable("onError");
    this.#commands.push(newErrorCmd(path, routeOrMiddleware, true));
    return this;
  }

  /** Set the outermost app wrapper component. */
  appWrapper(component: RouteComponent<State>): this {
    this.#assertMutable("appWrapper");
    this.#commands.push(newAppCmd(component));
    return this;
  }

  /** Add a layout component at a path. */
  layout(
    path: string,
    component: RouteComponent<State>,
    config?: LayoutConfig,
  ): this {
    this.#assertMutable("layout");
    this.#commands.push(newLayoutCmd(path, component, config, true));
    return this;
  }

  /** Add a route with optional config. */
  route(
    path: string,
    route: MaybeLazy<Route<State>>,
    config?: RouteConfig,
  ): this {
    this.#assertMutable("route");
    this.#commands.push(newRouteCmd(path, route, config, true));
    return this;
  }

  /** Add a GET handler. */
  get(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#assertMutable("get");
    this.#commands.push(newHandlerCmd("GET", path, middlewares, true));
    return this;
  }

  /** Add a POST handler. */
  post(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#assertMutable("post");
    this.#commands.push(newHandlerCmd("POST", path, middlewares, true));
    return this;
  }

  /** Add a PATCH handler. */
  patch(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#assertMutable("patch");
    this.#commands.push(newHandlerCmd("PATCH", path, middlewares, true));
    return this;
  }

  /** Add a PUT handler. */
  put(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#assertMutable("put");
    this.#commands.push(newHandlerCmd("PUT", path, middlewares, true));
    return this;
  }

  /** Add a DELETE handler. */
  delete(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#assertMutable("delete");
    this.#commands.push(newHandlerCmd("DELETE", path, middlewares, true));
    return this;
  }

  /** Add a HEAD handler. */
  head(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#assertMutable("head");
    this.#commands.push(newHandlerCmd("HEAD", path, middlewares, true));
    return this;
  }

  /** Add a handler for all HTTP verbs. */
  all(path: string, ...middlewares: MaybeLazy<Middleware<State>>[]): this {
    this.#assertMutable("all");
    this.#commands.push(newHandlerCmd("ALL", path, middlewares, true));
    return this;
  }

  /**
   * Register a WebSocket endpoint at `path`. Handlers receive the upgraded
   * `WebSocket` and the request
   * `Context`, so middleware-set state (auth, request id, …) is available
   * before the first frame.
   *
   * Always uses managed mode: Howl performs the `Upgrade` check, calls
   * `Deno.upgradeWebSocket`, wires your handlers as event listeners, and
   * returns the upgrade response. Non-WS requests get a 426.
   *
   * @example
   * ```ts
   * app.ws("/ws", {
   *   open: (socket, ctx) => {
   *     const userId = ctx.state.userContext?.user.id;
   *     if (!userId) { socket.close(1008, "Unauthorized"); return; }
   *     hub.subscribe(`user:${userId}`, socket);
   *   },
   *   message: (socket, e) => socket.send(`echo: ${e.data}`),
   *   close: (socket) => hub.unsubscribe(socket),
   * }, { idleTimeout: 30 });
   * ```
   */
  ws(
    path: string,
    handlers: WebSocketHandlers<State>,
    options?: WebSocketUpgradeOptions,
  ): this {
    const wsPort = options?.port;
    const wsHost = options?.hostname;
    if (wsPort !== undefined) {
      const entry = this.#wsPortRoutes.get(wsPort) ??
        { hostname: wsHost, paths: new Set<string>() };
      entry.paths.add(path);
      this.#wsPortRoutes.set(wsPort, entry);
    }

    // Only the upgrade-relevant subset is forwarded to Deno.upgradeWebSocket.
    const upgradeOptions: Deno.UpgradeWebSocketOptions | undefined = options
      ? { protocol: options.protocol, idleTimeout: options.idleTimeout }
      : undefined;

    const middleware: Middleware<State> = (ctx) => {
      if (ctx.req.headers.get("upgrade") !== "websocket") {
        return new Response("WebSocket upgrade required", { status: 426 });
      }

      const { socket, response } = Deno.upgradeWebSocket(ctx.req, upgradeOptions);

      if (handlers.open) {
        socket.addEventListener(
          "open",
          () => handlers.open!(socket, ctx),
        );
      }
      if (handlers.message) {
        socket.addEventListener(
          "message",
          (event) => handlers.message!(socket, event, ctx),
        );
      }
      if (handlers.close) {
        socket.addEventListener(
          "close",
          (event) => handlers.close!(socket, event.code, event.reason, ctx),
        );
      }
      if (handlers.error) {
        socket.addEventListener(
          "error",
          (event) => handlers.error!(socket, event, ctx),
        );
      }

      return response;
    };

    this.#assertMutable("ws");
    this.#commands.push(newHandlerCmd("GET", path, [middleware], true));
    return this;
  }

  /**
   * Insert file-system routes collected by the Builder.
   *
   * @example
   * app.fsClientRoutes();
   */
  fsClientRoutes(pattern = "*"): this {
    this.#assertMutable("fsClientRoutes");
    this.#commands.push({
      type: CommandType.FsRoute,
      pattern,
      getItems: () => {
        const buildCache = this.#getBuildCache();
        if (buildCache === null) return [];
        return buildCache.getFsRoutes();
      },
      includeLastSegment: false,
    });
    return this;
  }

  /**
   * Enable API routes from the apis/ directory.
   * HowlBuilder crawls apis/ at startup and registers all .api.ts files.
   *
   * Convention: place API definitions in apis/**\/*.api.ts
   *
   * @example
   * import { apiConfig } from "./howl.config.ts";
   * app.fsApiRoutes(apiConfig);
   */
  fsApiRoutes(config?: unknown): this {
    this.#assertMutable("fsApiRoutes");
    this.#apiRoutesEnabled = true;
    if (config !== undefined) this.#apiConfig = config;
    const cmd: ApiRouteCommand<State> = { type: CommandType.ApiRoute, getItems: () => [] };
    this.#apiRouteCmd = cmd;
    this.#commands.push(cmd);
    return this;
  }

  /** @internal — used by HowlBuilder */
  isApiRoutesEnabled(): boolean {
    return this.#apiRoutesEnabled;
  }

  /** @internal — used by HowlBuilder */
  getApiConfig(): unknown {
    return this.#apiConfig;
  }

  /** @internal — used by HowlBuilder to populate the ApiRouteCommand at its registered position */
  setApiRouteItems(items: Command<State>[]): void {
    if (this.#apiRouteCmd !== null) {
      this.#apiRouteCmd.getItems = () => items;
    }
  }

  /**
   * Merge another Howl instance into this app at the specified path.
   */
  mountApp(path: string, app: Howl<State>): this {
    this.#assertMutable("mountApp");
    for (let i = 0; i < app.#commands.length; i++) {
      const cmd = app.#commands[i];
      if (
        cmd.type !== CommandType.App &&
        cmd.type !== CommandType.NotFound &&
        cmd.type !== CommandType.ApiRoute
      ) {
        let effectivePattern = cmd.pattern;
        if (app.config.basePath) {
          effectivePattern = mergePath(app.config.basePath, cmd.pattern, false);
        }
        const clone = {
          ...cmd,
          pattern: mergePath(path, effectivePattern, true),
          includeLastSegment: cmd.pattern === "/" || cmd.includeLastSegment,
        };
        this.#commands.push(clone);
        continue;
      }
      this.#commands.push(cmd);
    }

    // deno-lint-ignore no-this-alias
    const self = this;
    app.#getBuildCache = () => self.#getBuildCache();
    return this;
  }

  /**
   * Create a handler function for `Deno.serve` or testing.
   *
   * Pass `boundPort` when building a handler for a secondary listener that
   * should only serve the WS routes bound to that port (everything else 404s).
   * Omit it for the main listener — port-bound WS paths are then 404'd from
   * the main port instead. {@linkcode Howl.listen} wires this automatically.
   */
  handler(boundPort?: number): (
    request: Request,
    info?: Deno.ServeHandlerInfo,
  ) => Promise<Response> {
    const cacheKey = boundPort ?? -1;
    const cached = this.#handlerCache.get(cacheKey);
    if (cached !== undefined) return cached;
    this.#frozen = true;

    let buildCache = this.#getBuildCache();
    if (buildCache === null) {
      if (this.config.mode === "production" && DENO_DEPLOYMENT_ID !== undefined) {
        throw new Error(
          `Could not find _howl directory. Did you forget to run "deno task build"?`,
        );
      } else {
        buildCache = new MockBuildCache([], this.config.mode);
      }
    }

    const router = new UrlPatternRouter<Middleware<State>>();
    const { rootHandler } = applyCommands(
      router,
      this.#commands,
      this.config.basePath,
      this.#onError,
    );

    // Pre-compute which paths this listener should accept.
    // - Secondary (boundPort set): only the WS paths bound to that port.
    // - Main (boundPort undefined): everything except paths bound to a WS port.
    const wsPortRoutes = this.#wsPortRoutes;
    const allWsPortPaths = new Set<string>();
    for (const entry of wsPortRoutes.values()) {
      for (const p of entry.paths) allWsPortPaths.add(p);
    }
    const allowedWsPaths = boundPort !== undefined
      ? wsPortRoutes.get(boundPort)?.paths ?? new Set<string>()
      : null;

    const aliveUrl = this.config.basePath + ALIVE_URL;
    const isProduction = this.config.mode !== "development";

    const handlerFn = async (
      req: Request,
      conn: Deno.ServeHandlerInfo = DEFAULT_CONN_INFO,
    ) => {
      const url = new URL(req.url);
      url.pathname = url.pathname.replace(/\/+/g, "/");

      // Cached dev clients (with `/_howl/alive` baked into their bundle)
      // hit production servers in a reconnect loop, throwing 404s every
      // few seconds. Quietly accept the WS upgrade and send a bumped
      // revision so the dev client reloads — once reloaded the prod
      // runtime takes over and the polling stops. In dev, the
      // `liveReload()` middleware intercepts before this falls through.
      if (isProduction && url.pathname === aliveUrl) {
        if (req.headers.get("upgrade") === "websocket") {
          try {
            const { response, socket } = Deno.upgradeWebSocket(req);
            socket.addEventListener("open", () => {
              socket.send(JSON.stringify({
                type: "initial-state",
                revision: Date.now(),
              }));
              socket.close(1000, "stale dev client — reloading");
            });
            return response;
          } catch {
            return new Response(null, { status: 404 });
          }
        }
        return new Response(null, { status: 404 });
      }

      // Port-isolated WS routing.
      if (allowedWsPaths !== null) {
        // Secondary listener: only its bound WS paths are reachable.
        if (!allowedWsPaths.has(url.pathname)) {
          return new Response("Not Found", { status: 404 });
        }
      } else if (allWsPortPaths.has(url.pathname)) {
        // Main listener: hide WS paths that belong to a secondary port.
        return new Response("Not Found", { status: 404 });
      }

      const method = req.method.toUpperCase() as Method;
      const matched = router.match(method, url);
      let { params, pattern, item: handler, methodMatch } = matched;

      // SSG short-circuit: routes prerendered at build time skip the entire
      // middleware/handler chain and serve the cached HTML. Limited to GET
      // (and HEAD, handled below by stripping the body) and full-page
      // requests — partial nav still needs a live render to produce the
      // partial fragment response shape.
      if (
        (method === "GET" || method === "HEAD") &&
        pattern !== null &&
        !url.searchParams.has(PARTIAL_SEARCH_PARAM) &&
        buildCache!.ssgPages.size > 0
      ) {
        const html = buildCache!.ssgPages.get(pattern);
        if (html !== undefined) {
          const body = method === "HEAD" ? null : html;
          return new Response(body, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      }

      const span = trace.getActiveSpan();
      if (span && pattern) {
        span.updateName(`${method} ${pattern}`);
        span.setAttribute("http.route", pattern);
      }

      let next: () => Promise<Response>;
      if (pattern === null || !methodMatch) {
        handler = rootHandler;
      }

      if (matched.pattern !== null && !methodMatch) {
        if (method === "OPTIONS") {
          const allowed = router.getAllowedMethods(matched.pattern);
          next = defaultOptionsHandler(allowed);
        } else {
          next = DEFAULT_NOT_ALLOWED_METHOD;
        }
      } else {
        next = DEFAULT_NOT_FOUND;
      }

      const ctx = new Context<State>(
        req,
        url,
        conn,
        matched.pattern,
        params,
        this.config,
        next,
        buildCache!,
        new Headers(), // response headers instance
      );

      try {
        const result = await (handler !== null ? handler(ctx) : next());
        if (!(result instanceof Response)) {
          throw new Error(
            `Expected a "Response" instance, but got: ${result}`,
          );
        }
        if (method === "HEAD") return new Response(null, result);
        return result;
      } catch (err) {
        ctx.error = err;
        return await DEFAULT_ERROR_HANDLER(ctx);
      }
    };

    this.#handlerCache.set(cacheKey, handlerFn);
    return handlerFn;
  }

  /**
   * Start the server.
   *
   * @example
   * await app.listen({ port: 8000 });
   */
  listen(options: ListenOptions = {}): void {
    if (!options.onListen) {
      options.onListen = createOnListen(this.config.basePath, options);
    }
    const mainHandler = this.handler();

    // Spawn a separate Deno.serve for each WS port — each gets a handler
    // bound to that port so it only serves the WS paths registered there.
    // The middleware pipeline is the same, so auth and ctx.state work
    // identically on every listener.
    for (const [port, entry] of this.#wsPortRoutes) {
      const wsHandler = this.handler(port);
      Deno.serve({
        port,
        hostname: entry.hostname ?? options.hostname,
        onListen: ({ hostname, port }) => {
          // deno-lint-ignore no-console
          console.log(
            `    ${colors.bold("WebSocket:")} ${
              colors.rgb24(`ws://${hostname}:${port}`, 0x9b59b6)
            }  ${colors.dim(`← ${[...entry.paths].join(", ")}`)}`,
          );
        },
      }, wsHandler);
    }

    if (options.port) {
      Deno.serve(options, mainHandler);
      return;
    }
    listenOnFreePort(options, mainHandler);
  }

  /**
   * Returns registered client configs.
   * Used internally by HowlBuilder.
   */
  getClients(): ClientConfig[] {
    return this.#clients;
  }

  /**
   * Register a client app.
   * Each client is an isolated island/route build mounted at a path.
   *
   * @example
   * app.client({ name: "main", dir: "./apps/main", mount: "/" });
   */
  client(config: ClientConfig): this {
    this.#clients.push(config);
    return this;
  }
}
