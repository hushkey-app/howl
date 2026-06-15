import type { Middleware } from "../../core/middlewares/mod.ts";
import { ALIVE_URL } from "../../core/constants.ts";

// Live reload: Send updates to browser
export function liveReload<T>(): Middleware<T> {
  const revision = Date.now();

  return (ctx: any) => {
    const { config, req, url } = ctx;

    const aliveUrl = config.basePath + ALIVE_URL;

    if (url.pathname === aliveUrl) {
      if (req.headers.get("upgrade") !== "websocket") {
        return new Response(null, { status: 501 });
      }

      // WebSockets bypass CORS, so an arbitrary website could open
      // `ws://localhost:8000/_howl/alive` from a visitor's browser. Reject
      // upgrades whose Origin doesn't match the host being served (an absent
      // Origin means a non-browser client — allowed).
      const origin = req.headers.get("origin");
      if (origin !== null) {
        let originHost: string | null = null;
        try {
          originHost = new URL(origin).host;
        } catch {
          // malformed Origin — treat as cross-origin
        }
        if (originHost !== url.host) {
          return new Response(null, { status: 403 });
        }
      }

      // TODO: When a change is made the Deno server restarts,
      // so for now the WebSocket connection is only used for
      // the client to know when the server is back up. Once we
      // have HMR we'll actively start sending messages back
      // and forth.
      const { response, socket } = Deno.upgradeWebSocket(req);

      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "initial-state",
            revision,
          }),
        );
      });

      return response;
    }

    return ctx.next();
  };
}
