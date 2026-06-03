import { DEV_ERROR_OVERLAY_URL } from "../../../core/constants.ts";
import { isHttpError } from "../../../core/error.ts";
import type { Middleware } from "../../../core/middlewares/mod.ts";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

/** Render a minimal, framework-free dev error page to an HTML string. */
function errorPage(title: string, message: string, stack: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title><style>` +
    `body{font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;background:#18181b;` +
    `color:#e4e4e7;margin:0;padding:2.5rem}h1{color:#f87171;font-size:1.25rem;margin:0 0 1rem}` +
    `pre{background:#000;color:#d4d4d8;padding:1rem;border-radius:.5rem;overflow:auto;` +
    `white-space:pre-wrap;word-break:break-word}.msg{color:#fca5a5;margin-bottom:1rem}` +
    `</style></head><body><h1>${esc(title)}</h1>` +
    `<div class="msg">${esc(message)}</div>` +
    (stack ? `<pre>${esc(stack)}</pre>` : "") +
    `</body></html>`;
}

/**
 * Dev-only error middleware. Serves a framework-free HTML error page for the
 * overlay route (populated from query params) and for uncaught 5xx errors.
 */
export function devErrorOverlay<T>(): Middleware<T> {
  // deno-lint-ignore no-explicit-any
  return async (ctx: any) => {
    const { config, url } = ctx;
    if (url.pathname === config.basePath + DEV_ERROR_OVERLAY_URL) {
      return ctx.html(
        errorPage(
          url.searchParams.get("title") ?? "Error",
          url.searchParams.get("message") ?? "",
          url.searchParams.get("stack") ?? "",
        ),
      );
    }

    try {
      return await ctx.next();
    } catch (err) {
      if (ctx.req.headers.get("accept")?.includes("text/html")) {
        let status = 500;
        if (isHttpError(err)) {
          if (err.status < 500) throw err;
          status = err.status;
        }
        // deno-lint-ignore no-console
        console.error(err);
        const e = err as { name?: string; message?: string; stack?: string };
        return ctx.html(
          errorPage(e.name ?? "Error", e.message ?? String(err), e.stack ?? ""),
          { status },
        );
      }
      throw err;
    }
  };
}
