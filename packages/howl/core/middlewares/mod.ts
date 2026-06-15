/**
 * @module
 *
 * Middleware barrel for `@hushkey/howl/middleware`. Exports the built-in
 * middleware family — {@linkcode coalesceRequests}, {@linkcode compression},
 * {@linkcode cors}, {@linkcode csrf}, {@linkcode csp},
 * {@linkcode staticFiles}, {@linkcode trailingSlashes} — together with
 * the {@linkcode Middleware} / {@linkcode MaybeLazyMiddleware} types and
 * the framework-internal {@linkcode compileMiddlewares} helper used to
 * fold a chain into a single handler.
 */

import type { Context } from "../context.ts";
import type { Howl as _Howl } from "../app.ts";
import type { Define as _Define } from "../define.ts";
import { isTracingActive, recordSpanError, tracer } from "../otel.ts";
// --- Built-in middleware implementations ---
export { compression } from "./compression.ts";
export { coalesceRequests } from "./coalesce.ts";
export { cors, type CORSOptions } from "./cors.ts";
export { csrf, type CsrfOptions } from "./csrf.ts";
export { csp, type CSPOptions } from "./csp.ts";
export { trailingSlashes } from "./trailing_slashes.ts";
export { staticFiles } from "./static_files.ts";

/**
 * A middleware function is the basic building block of Howl. It allows you
 * to respond to an incoming request in any way you want. You can redirect
 * routes, serve files, create APIs and much more. Middlewares can be chained by
 * calling {@linkcode Context.next|ctx.next()} inside of the function.
 *
 * Middlewares can be synchronous or asynchronous. If a middleware returns a
 * {@linkcode Response} object, the response will be sent back to the client. If
 * a middleware returns a `Promise<Response>`, Howl will wait for the promise
 * to resolve before sending the response.
 *
 * A {@linkcode Context} object is passed to the middleware function. This
 * object contains the original request object, as well as any state related to
 * the current request. The context object also contains methods to redirect
 * the client to another URL, or to call the next middleware in the chain.
 *
 * Middlewares can be defined as a single function or an array of functions.
 * When an array of middlewares is passed to
 * {@linkcode _Howl.prototype.use|app.use}, Howl will call each middleware in the
 * order they are defined.
 *
 * Middlewares can also be defined using the
 * {@linkcode _Define.middleware|define.middleware} method. This
 * method is optional, but it can be useful for type checking and code
 * completion. It does not register the middleware with the app.
 *
 * ## Examples
 *
 * ### Logging middleware
 *
 * This example shows how to create a simple middleware that logs incoming
 * requests.
 *
 * ```ts
 * // Define a middleware function that logs incoming requests. Using the
 * // `define.middleware` method is optional, but it can be useful for type
 * // checking and code completion. It does not register the middleware with the
 * // app.
 * const loggerMiddleware = define.middleware((ctx) => {
 *   console.log(`${ctx.req.method} ${ctx.req.url}`);
 *   // Call the next middleware
 *   return ctx.next();
 * });
 *
 * // To register the middleware to the app, use `app.use`.
 * app.use(loggerMiddleware)
 * ```
 *
 * ### Redirect middleware
 *
 * This example shows how to create a middleware that redirects requests from
 * one URL to another.
 *
 * ```ts
 * // Any request to a URL that starts with "/legacy/" will be redirected to
 * // "/modern".
 * const redirectMiddleware = define.middleware((ctx) => {
 *   if (ctx.url.pathname.startsWith("/legacy/")) {
 *     return ctx.redirect("/modern");
 *   }
 *
 *   // Otherwise call the next middleware
 *   return ctx.next();
 * });
 *
 * // Again, register the middleware with the app.
 * app.use(redirectMiddleware);
 * ```
 */

/**
 * A function invoked for each request — receives a {@linkcode Context} and
 * must return a {@linkcode Response} (synchronously or via a `Promise`).
 *
 * See the module-level documentation for the full middleware contract.
 */
export type Middleware<State> = (
  ctx: Context<State>,
) => Response | Promise<Response>;

/**
 * A lazy {@linkcode Middleware}
 */
export type MaybeLazyMiddleware<State> = (
  ctx: Context<State>,
) => Response | Promise<Response | Middleware<State>>;

/**
 * Compile a middleware chain into a single handler at startup.
 *
 * Each step receives `tail` (the original `ctx.next`) by parameter, avoiding
 * the infinite-recursion bug where a compiled tail would otherwise read an
 * already-overwritten `ctx.next`. Safe under concurrent requests.
 *
 * @internal Used by {@linkcode applyCommands} when building the router.
 */
export function compileMiddlewares<State>(
  middlewares: MaybeLazyMiddleware<State>[],
  onError?: (err: unknown) => void,
): Middleware<State> {
  if (middlewares.length === 0) return (ctx) => ctx.next();

  type ChainFn = (
    ctx: Context<State>,
    tail: () => Promise<Response>,
  ) => Response | Promise<Response>;

  let chain: ChainFn = (_ctx, tail) => tail();

  for (let i = middlewares.length - 1; i >= 0; i--) {
    const nextChain = chain;
    let middleware = middlewares[i];
    chain = async (ctx, tail) => {
      // Note: no internals (app/layouts) bookkeeping here — the only mutators
      // are the segment middlewares (self-restoring in their own `finally`)
      // and `renderRoute` (restores in its own `finally`).
      ctx.next = () => nextChain(ctx, tail) as Promise<Response>;
      try {
        const result = await middleware(ctx);
        if (typeof result === "function") {
          middleware = result;
          return await result(ctx);
        }

        return result;
      } catch (err) {
        if (ctx.error !== err) {
          ctx.error = err;

          if (onError !== undefined) {
            onError(err);
          }
        }
        throw err;
      }
    };
  }

  const count = middlewares.length;
  return (ctx) => {
    const tail = ctx.next;
    if (!isTracingActive()) {
      return Promise.resolve(chain(ctx, tail));
    }
    return tracer.startActiveSpan("middlewares", {
      attributes: { "howl.middleware.count": count },
    }, async (span) => {
      try {
        return await chain(ctx, tail);
      } catch (err) {
        recordSpanError(span, err);
        throw err;
      } finally {
        span.end();
      }
    });
  };
}
