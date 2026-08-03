import type { Middleware } from "../../core/middlewares/mod.ts";
import { ALIVE_URL } from "../../core/constants.ts";

/**
 * Tracks the browsers connected to the dev server's `/_howl/alive` socket and
 * tells them when to reload.
 *
 * The wire format is a single `initial-state` message carrying a monotonic
 * `revision`. A client remembers the first revision it sees and reloads when a
 * later message carries a higher one — so the same message both greets a fresh
 * connection and triggers a reload on an existing one. That is what lets the
 * dev server hot-rebuild in place: before hot reload the process restarted and
 * the revision changed with it, now it changes without the process going away.
 */
export class DevReloadHub {
  #sockets = new Set<WebSocket>();
  #revision = Date.now();

  /** Current revision — bumped on every {@linkcode notifyReload}. */
  get revision(): number {
    return this.#revision;
  }

  /** Number of currently connected browsers. */
  get clientCount(): number {
    return this.#sockets.size;
  }

  /** Register an open socket and send it the current revision. */
  add(socket: WebSocket): void {
    this.#sockets.add(socket);
    const drop = () => this.#sockets.delete(socket);
    socket.addEventListener("close", drop);
    socket.addEventListener("error", drop);
    socket.addEventListener("open", () => this.#send(socket));
    // `Deno.upgradeWebSocket` may resolve the socket already open when the
    // handler is re-entered from a queued upgrade — greet it either way.
    if (socket.readyState === WebSocket.OPEN) this.#send(socket);
  }

  /**
   * Bump the revision and tell every connected browser to reload. The clock is
   * only a tiebreaker for restarts — two rebuilds inside the same millisecond
   * must still produce a strictly higher number or the reload is dropped.
   */
  notifyReload(): void {
    this.#revision = Math.max(Date.now(), this.#revision + 1);
    for (const socket of this.#sockets) this.#send(socket);
  }

  #send(socket: WebSocket): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({ type: "initial-state", revision: this.#revision }));
    } catch {
      // Socket died between the readyState check and the send — the close
      // listener removes it; a failed reload notice is not worth surfacing.
      this.#sockets.delete(socket);
    }
  }
}

/**
 * Dev-server middleware serving the `/_howl/alive` websocket.
 *
 * Pass the {@linkcode DevReloadHub} the builder owns to drive reloads from
 * hot rebuilds; without one the middleware still answers the endpoint (so a
 * client can detect a process restart) but nothing can push a reload.
 */
export function liveReload<T>(hub: DevReloadHub = new DevReloadHub()): Middleware<T> {
  // deno-lint-ignore no-explicit-any
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

      const { response, socket } = Deno.upgradeWebSocket(req);
      hub.add(socket);

      return response;
    }

    return ctx.next();
  };
}
