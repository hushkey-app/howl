import { eTag, ifNoneMatch } from "@std/http/etag";
import { generate } from "@std/uuid/v5";
import { NAMESPACE_URL } from "@std/uuid/constants";
import type { Middleware } from "../../core/middlewares/mod.ts";

/**
 * Automatically detects workspace folders for DevTools in Chromium browsers.
 *
 * Without this middleware, if the feature is enabled and devTools is opened
 * there will be 404 errors in the console. This can be annoying for developers,
 * especially if there is logging for incoming requests.
 *
 * Enabling this feature can be helpful to make edits in DevTools change source
 * files directly, for a small amount of code.
 *
 * The UUID is generated with a UUIDv5, so that the same directory should
 * always generate the same UUID. This way, we can preserve the connected
 * workspace across reloads without writing anything to disk.
 *
 * @see https://chromium.googlesource.com/devtools/devtools-frontend/+/main/docs/ecosystem/automatic_workspace_folders.md
 */
export function automaticWorkspaceFolders<T>(root: string): Middleware<T> {
  let uuid: string | undefined;
  let etag: string | undefined;
  let content: string | undefined;

  return async (ctx: any) => {
    const { pathname } = ctx.url;

    if (pathname !== "/.well-known/appspecific/com.chrome.devtools.json") {
      return ctx.next();
    }

    // The payload contains the absolute project root. Only Chrome DevTools on
    // the dev machine itself requests this file, so answer loopback clients
    // only — LAN devices (phone/tablet testing) get a quiet 404 and never need
    // it anyway.
    const remote = ctx.info?.remoteAddr as Deno.NetAddr | undefined;
    const isLoopback = remote === undefined || remote.transport !== "tcp" ||
      remote.hostname === "127.0.0.1" || remote.hostname === "::1" ||
      remote.hostname === "localhost";
    if (!isLoopback) {
      return new Response(null, { status: 404 });
    }

    uuid ??= await generate(
      NAMESPACE_URL,
      new TextEncoder().encode(
        `https://hushkey.app/howl?root=${encodeURIComponent(root)}&v=${0}`,
      ),
    );
    content ??= JSON.stringify({ workspace: { root, uuid } }, undefined, 2);
    etag ??= await eTag(content);

    const noneMatchValue = ctx.req.headers.get("if-none-match");
    if (!ifNoneMatch(noneMatchValue, etag)) {
      return new Response(undefined, { status: 304, headers: { etag: etag ?? "" } });
    }
    return new Response(content, { status: 200, headers: { etag: etag ?? "" } });
  };
}
