import type { Middleware } from "./mod.ts";

const COMPRESSIBLE = /text\/|application\/json|application\/javascript|image\/svg/;

/** Bodies below this size gain nothing from gzip (header overhead ≈ savings). */
const MIN_COMPRESS_BYTES = 1024;

/**
 * Gzip-compresses responses whose Content-Type is text, JSON, JS, or SVG.
 * Skips already-encoded responses, HEAD requests, bodies with no content, and
 * responses with a declared `Content-Length` under 1 KB (too small to gain).
 *
 * Place this early in the middleware chain so it wraps all responses.
 *
 * @example
 * app.use(compression());
 * app.use(staticFiles());
 * app.fsClientRoutes();
 */
// deno-lint-ignore no-explicit-any
export function compression(): Middleware<any> {
  // deno-lint-ignore no-explicit-any
  return async (ctx: any) => {
    const response: Response = await ctx.next();

    if (
      ctx.req.method === "HEAD" ||
      response.body === null ||
      response.headers.get("content-encoding")
    ) {
      return response;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!COMPRESSIBLE.test(contentType)) {
      return response;
    }

    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader !== null && Number(lengthHeader) < MIN_COMPRESS_BYTES) {
      return response;
    }

    const accept = ctx.req.headers.get("accept-encoding") ?? "";
    const encoding: CompressionFormat | null = accept.includes("gzip")
      ? "gzip"
      : accept.includes("deflate")
      ? "deflate"
      : null;

    if (!encoding) return response;

    const compressed = response.body.pipeThrough(new CompressionStream(encoding));

    const headers = new Headers(response.headers);
    headers.set("Content-Encoding", encoding);
    headers.delete("Content-Length");
    headers.append("Vary", "Accept-Encoding");

    return new Response(compressed, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
