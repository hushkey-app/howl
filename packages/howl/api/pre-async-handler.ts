import type { Context } from "../core/context.ts";
import { z, ZodError } from "zod";
import type { RequestBodySchema } from "./types.ts";
import { setApiRequestState } from "./_request_state.ts";

/**
 * Pre-handler middleware — runs before every API handler.
 * Validates path params, query params, and parses/validates request body.
 * Parsed values are stashed on a WeakMap (see `_request_state.ts`) keyed by
 * the {@linkcode Context}, so framework-internal state never leaks onto the
 * user-facing `ctx.state`. The {@linkcode asyncHandler} pipeline reads them
 * back to expose `ctx.req.body` and a typed `ctx.query()` to handlers.
 */
export function preAsyncHandler<State>(
  params: z.ZodObject<any, any> | undefined | null,
  requestBodySchema: RequestBodySchema | null | undefined,
  querySchema: z.ZodObject<any, any> | null | undefined,
) {
  return async (ctx: Context<State>): Promise<Response> => {
    try {
      // Validate path params
      if (params) {
        params.parse(ctx.params);
      }

      // Validate and store query params
      if (querySchema) {
        const raw: Record<string, string> = {};
        ctx.url.searchParams.forEach((val, key) => {
          raw[key] = val;
        });
        setApiRequestState(ctx, { query: querySchema.parse(raw) });
      }

      // Skip body parsing for read-only methods
      if (
        ctx.req.method === "GET" ||
        ctx.req.method === "OPTIONS" ||
        ctx.req.method === "HEAD"
      ) {
        return ctx.next();
      }

      // Only consume + JSON.parse the body when the request is actually JSON.
      // Leave multipart/form-data and url-encoded streams unconsumed so
      // handlers can call ctx.req.formData() directly.
      const contentType = ctx.req.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const isMultipart = contentType.includes("multipart/form-data") ||
        contentType.includes("application/x-www-form-urlencoded");

      if (!isJson && !requestBodySchema) {
        // Store raw body only for non-streaming content types (e.g. webhook text/plain).
        // Multipart streams must remain unconsumed for formData() to work.
        if (!isMultipart) {
          setApiRequestState(ctx, { rawBody: await ctx.req.text() });
        }
        return ctx.next();
      }

      let data: unknown = {};
      const raw = await ctx.req.text();
      if (raw.trim() !== "") {
        try {
          data = JSON.parse(raw);
        } catch {
          return ctx.json(
            { error: "Invalid JSON body" },
            { status: 400 },
          );
        }
      }

      if (requestBodySchema) {
        data = requestBodySchema.parse(data);
      }

      setApiRequestState(ctx, { rawBody: raw, body: data });
      return ctx.next();
    } catch (err) {
      if (err instanceof ZodError) {
        return ctx.json(
          {
            error: "Validation failed",
            fields: err.issues.map((i) => ({
              field: i.path.join("."),
              message: i.message,
            })),
          },
          { status: 400 },
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      return ctx.json({ error: message }, { status: 400 });
    }
  };
}
