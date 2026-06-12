import type { Middleware } from "./mod.ts";

/** Options for {@linkcode coalesceRequests}. */
export interface CoalesceOptions {
  /**
   * Maximum response body size (bytes) eligible for coalescing. Larger
   * responses are passed through without deduplication so concurrent
   * waiters don't all clone megabyte-sized payloads off the same buffer.
   *
   * Streaming responses (no `Content-Length` header) are never coalesced.
   * @default 1_048_576 (1 MiB)
   */
  maxBodyBytes?: number;
}

/**
 * Deduplicates concurrent GET requests to the same URL from unauthenticated
 * clients. When a thundering herd hits a public page before the first render
 * resolves, only one handler runs — all others await and receive a clone.
 *
 * Safe only for public routes: requests with a Cookie or Authorization header
 * are never coalesced (user-specific state would bleed between renders).
 * Note: coalescing is per-instance — use this alongside a shared cache adapter
 * for full cross-instance deduplication.
 *
 * Responses larger than `maxBodyBytes` (1 MiB by default) and any response
 * without a `Content-Length` header (streamed bodies, SSE, file downloads)
 * are passed through without deduplication. This bounds the memory cost of
 * the in-flight buffer and keeps streams from being teed to multiple
 * waiters.
 *
 * Place early in the middleware chain, before route handlers.
 *
 * @example
 * app.use(coalesceRequests());
 * app.use(coalesceRequests({ maxBodyBytes: 256 * 1024 }));
 * app.fsClientRoutes();
 */
// deno-lint-ignore no-explicit-any
export function coalesceRequests(options: CoalesceOptions = {}): Middleware<any> {
  const maxBodyBytes = options.maxBodyBytes ?? 1_048_576;
  const inflight = new Map<string, Promise<Response>>();

  // deno-lint-ignore no-explicit-any
  return async (ctx: any) => {
    if (
      ctx.req.method !== "GET" ||
      ctx.req.headers.has("cookie") ||
      ctx.req.headers.has("authorization")
    ) {
      return ctx.next();
    }

    const key = ctx.url.pathname + ctx.url.search;

    const leader = inflight.get(key);
    if (leader !== undefined) {
      try {
        return (await leader).clone();
      } catch {
        // The leader's response was non-coalescable (streamed or oversize),
        // or the leader threw. Fall through and run our own handler chain.
      }
    }

    let settle!: (r: Response) => void;
    let reject!: (e: unknown) => void;
    const shared = new Promise<Response>((res, rej) => {
      settle = res;
      reject = rej;
    });
    // Suppress the unhandled-rejection warning for the case where a leader
    // rejects (oversize/streamed/error) before any waiter has joined the
    // promise — the rejection is part of normal control flow.
    shared.catch(() => {});
    inflight.set(key, shared);

    try {
      const response = await ctx.next();
      // Skip coalescing for genuinely streamed bodies (SSE, chunked
      // transfer) and for responses that explicitly declare an oversize
      // body. Most short JSON / HTML responses never set Content-Length,
      // so absence of the header is treated as "small enough" rather than
      // "streamed" — coalesce-or-not falls back to the safe default.
      const lengthHeader = response.headers.get("content-length");
      const contentLength = lengthHeader !== null ? Number(lengthHeader) : null;
      const isOversize = contentLength !== null && !Number.isNaN(contentLength) &&
        contentLength > maxBodyBytes;
      const transferEncoding = response.headers.get("transfer-encoding");
      const isChunked = transferEncoding !== null &&
        transferEncoding.toLowerCase().includes("chunked");
      const isSse = (response.headers.get("content-type") ?? "")
        .toLowerCase()
        .startsWith("text/event-stream");
      if (isOversize || isChunked || isSse) {
        reject(new Error("response not coalescable"));
        return response;
      }
      settle(response.clone());
      return response;
    } catch (err) {
      reject(err);
      throw err;
    } finally {
      inflight.delete(key);
    }
  };
}
