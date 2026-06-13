import type { Context } from "../core/context.ts";
import type { Howl } from "../core/app.ts";
import type { AnyApiDefinition, CacheAdapter, HowlApiConfig, RateLimitConfig } from "./types.ts";
import { isHttpError } from "../core/error.ts";
import { getApiRequestState } from "./_request_state.ts";

// Helpers below operate on `Context<any>` because they read/inspect generic
// state slots that any user app might define. The `any` is contained — the
// outer pipeline preserves typed `Context<State>`.
// deno-lint-ignore no-explicit-any
type AnyCtx = Context<any>;
// deno-lint-ignore no-explicit-any
type AnyApiConfig = HowlApiConfig<any, any> | null;

function getClientIp(ctx: AnyCtx): string {
  return ctx.req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    ctx.req.headers.get("x-real-ip") ??
    (ctx.info.remoteAddr as Deno.NetAddr).hostname ??
    "unknown";
}

function resolveIdentifier(ctx: AnyCtx, howlConfig: AnyApiConfig): string | undefined {
  return howlConfig?.getRateLimitIdentifier?.(ctx);
}

/**
 * Fallback counter for adapters without atomic `incr`. Stores
 * `"count:expiresAt"` so the window expiry survives re-writes — a plain
 * `set(count, ttl)` would reset the TTL on every increment, turning the fixed
 * window into a sliding one that never expires under steady traffic.
 */
async function nonAtomicIncr(
  cache: CacheAdapter,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const raw = await cache.get(key);
  const now = Date.now();
  let count = 0;
  let expiresAt = now + ttlSeconds * 1000;
  if (raw) {
    const sep = raw.indexOf(":");
    if (sep > -1) {
      const storedExpiry = Number(raw.slice(sep + 1));
      if (storedExpiry > now) {
        count = Number(raw.slice(0, sep)) || 0;
        expiresAt = storedExpiry;
      }
    } else {
      // Legacy bare-number value — count it, start a fresh window.
      count = Number(raw) || 0;
    }
  }
  const next = count + 1;
  const remainingSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  await cache.set(key, `${next}:${expiresAt}`, remainingSeconds);
  return next;
}

async function checkRateLimit(
  ctx: AnyCtx,
  cache: CacheAdapter,
  rl: RateLimitConfig,
  howlConfig: AnyApiConfig,
): Promise<Response | null> {
  const identifier = resolveIdentifier(ctx, howlConfig) ?? getClientIp(ctx);
  const baseKey = `ratelimit:${identifier}:${ctx.req.method}:${ctx.url.pathname}`;
  const cntKey = `${baseKey}:cnt`;
  const blkKey = `${baseKey}:blk`;
  const now = Date.now();

  const blocked = await cache.get(blkKey);
  if (blocked) {
    const blockedUntil = Number(blocked);
    if (blockedUntil > now) {
      const retryAfter = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
      ctx.headers.set("Retry-After", String(retryAfter));
      ctx.headers.set("X-RateLimit-Limit", String(rl.max));
      ctx.headers.set("X-RateLimit-Remaining", "0");
      return ctx.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const incr = cache.incr ?? nonAtomicIncr.bind(null, cache);
  const ttlSeconds = Math.ceil(rl.windowMs / 1000);
  const count = await incr(cntKey, ttlSeconds);

  if (count > rl.max) {
    if (rl.blockDurationMs) {
      const blockedUntil = now + rl.blockDurationMs;
      await cache.set(blkKey, String(blockedUntil), Math.ceil(rl.blockDurationMs / 1000));
      ctx.headers.set("Retry-After", String(Math.ceil(rl.blockDurationMs / 1000)));
    } else {
      ctx.headers.set("Retry-After", String(ttlSeconds));
    }
    ctx.headers.set("X-RateLimit-Limit", String(rl.max));
    ctx.headers.set("X-RateLimit-Remaining", "0");
    return ctx.json({ error: "Too many requests" }, { status: 429 });
  }

  ctx.headers.set("X-RateLimit-Limit", String(rl.max));
  ctx.headers.set("X-RateLimit-Remaining", String(Math.max(0, rl.max - count)));
  return null;
}

/**
 * Cache key for a response, or `null` when caching must be skipped: on a
 * role-protected route with no user identifier available, a shared cache
 * entry would serve one user's response to another.
 */
function buildCacheKey(ctx: AnyCtx, perUser: boolean, howlConfig: AnyApiConfig): string | null {
  const base = `${ctx.req.method}:${ctx.url.pathname}${ctx.url.search}`;
  if (!perUser) return base;
  const id = resolveIdentifier(ctx, howlConfig);
  if (id === undefined) return null;
  return `${base}:${id}`;
}

interface ApiHandlerError {
  message?: string;
  status?: number;
}

/**
 * Build a child context that exposes the parsed body on `ctx.req.body` and a
 * typed `ctx.query()` reading from the WeakMap state.
 *
 * Implemented via `Proxy` rather than `Object.create` because `Context` uses
 * `#`-private fields. With `Object.create`, inherited methods would run with
 * `this` bound to the child object, and any private-field access from inside
 * those methods throws `Receiver must be an instance of class Context`. The
 * Proxy binds every function it returns to the real ctx, so private-field
 * access keeps working.
 */
function makeApiCtx<State>(ctx: Context<State>): Context<State> {
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      if (prop === "req") {
        const realReq = target.req;
        return new Proxy(realReq, {
          get(reqTarget, reqProp) {
            if (reqProp === "body") {
              return getApiRequestState(target).body ?? null;
            }
            const value = Reflect.get(reqTarget, reqProp, reqTarget);
            return typeof value === "function" ? value.bind(reqTarget) : value;
          },
        });
      }
      if (prop === "query") {
        const q = getApiRequestState(target).query;
        if (q !== undefined) {
          const qq = q as Record<string, unknown>;
          return (key?: string) => key !== undefined ? qq[key] : qq;
        }
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Context<State>;
}

/**
 * Core API execution pipeline.
 * Handles: auth, caching, handler execution, response formatting, errors.
 */
export function asyncHandler<State, Role extends string>(
  app: Howl<State>,
  api: AnyApiDefinition,
  howlConfig: HowlApiConfig<State, Role> | null,
  cache: CacheAdapter,
  rateLimitCache: CacheAdapter,
): (ctx: Context<State>) => Promise<Response> {
  return async (ctx: Context<State>): Promise<Response> => {
    const { name, directory, handler, roles, caching, before, after } = api;
    const ttl = caching?.ttl ?? 0;
    const protectedRoute = roles.length > 0;

    try {
      if (protectedRoute) {
        if (!howlConfig?.checkPermissionStrategy) {
          // deno-lint-ignore no-console
          console.warn(
            `🐺 "${name}" requires roles ${
              JSON.stringify(roles)
            } but no checkPermissionStrategy is configured. Pass checkPermissionStrategy to app.fsApiRoutes(). Request will proceed without auth.`,
          );
        } else {
          const result = await howlConfig.checkPermissionStrategy(ctx, roles as Role[]);
          if (result instanceof Response) return result;
        }
      }

      if (api.rateLimit !== false) {
        const rl = api.rateLimit ?? howlConfig?.defaultRateLimit;
        if (rl) {
          const limited = await checkRateLimit(ctx, rateLimitCache, rl, howlConfig);
          if (limited) return limited;
        }
      }

      const handlerCtx = makeApiCtx(ctx);

      // `after` hooks see every successful response the route emits — handler
      // result, cache hit, or a `before` short-circuit. A hook returning a
      // Response replaces the outgoing one; errors propagate to the catch.
      const applyAfter = async (response: Response): Promise<Response> => {
        if (after === undefined) return response;
        let current = response;
        for (const hook of after) {
          const result = await hook(handlerCtx, current, app);
          if (result instanceof Response) current = result;
        }
        return current;
      };

      // `before` hooks run post-auth/rate-limit/validation and pre-cache, so
      // side effects (job enqueueing, auditing) fire on cache hits too.
      if (before !== undefined) {
        for (const hook of before) {
          const result = await hook(handlerCtx, app);
          if (result instanceof Response) return await applyAfter(result);
        }
      }

      const cacheKey = ttl > 0 ? buildCacheKey(ctx, protectedRoute, howlConfig) : null;
      if (cacheKey) {
        const cached = await cache.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Record<string, unknown>;
          // Envelope carries the original status; bare objects are entries
          // written before the envelope existed — serve them as 200.
          const isEnvelope = parsed !== null && typeof parsed === "object" &&
            "__howlStatus" in parsed && "__howlBody" in parsed;
          const status = isEnvelope ? parsed.__howlStatus as number : 200;
          const body = isEnvelope ? parsed.__howlBody as Record<string, unknown> : parsed;
          return await applyAfter(ctx.json({ ok: true, ...body }, { status }));
        }
      }

      type HandlerFn = (ctx: Context<State>, app: Howl<State>) => unknown;
      const response: unknown = await (handler as HandlerFn)(handlerCtx, app);

      if (response instanceof Response) return await applyAfter(response);

      const respObj = (response ?? {}) as
        & Record<string, unknown>
        & { statusCode?: number; status?: number };
      const location = (respObj.headers as Headers | undefined)?.get?.("location");
      if (location) {
        return await applyAfter(
          ctx.redirect(location, respObj.statusCode ?? respObj.status ?? 302),
        );
      }

      const statusCode = respObj.statusCode ?? respObj.status ?? 200;
      const { statusCode: _sc, status: _st, ok: _ok, ...rest } = respObj;

      // Only cache successful bodied responses — a cached 4xx/5xx would be
      // replayed to every caller for the TTL, and 204 has no body to replay.
      if (cacheKey && statusCode >= 200 && statusCode < 300 && statusCode !== 204) {
        await cache.set(
          cacheKey,
          JSON.stringify({ __howlStatus: statusCode, __howlBody: rest }),
          ttl,
        );
      }

      if (statusCode === 204) {
        return await applyAfter(new Response(null, { status: 204, headers: ctx.headers }));
      }

      return await applyAfter(ctx.json({ ok: true, ...rest }, { status: statusCode }));
    } catch (err) {
      const e = err as ApiHandlerError & { statusCode?: number } | undefined;
      // `statusCode` honoured alongside `status` for older user code.
      const hinted = typeof e?.status === "number"
        ? e.status
        : typeof e?.statusCode === "number"
        ? e.statusCode
        : undefined;
      const statusCode = hinted ?? 500;
      // Only deliberate errors expose their message: HttpError (any status)
      // and errors carrying an explicit sub-500 status hint. An unexpected
      // throw could contain internals (driver errors, file paths) — the
      // client gets a generic message keyed by correlationId instead.
      const expose = isHttpError(err) || (hinted !== undefined && hinted < 500);
      const errorMessage = expose && typeof e?.message === "string" && e.message !== ""
        ? e.message
        : "Something went wrong, try again.";

      const correlationId = crypto.randomUUID();
      const service =
        `DIR_${directory.toLowerCase()}_NAME_${name.toLowerCase()}_METHOD_${ctx.req.method.toLowerCase()}`;

      // Log the error itself (message + stack), not just the client-facing text.
      // deno-lint-ignore no-console
      console.error(`[${correlationId}] ${service}`, err);

      ctx.headers.set("X-Howl-Correlation-Id", correlationId);
      return ctx.json(
        { error: errorMessage, correlationId },
        { status: statusCode },
      );
    }
  };
}
