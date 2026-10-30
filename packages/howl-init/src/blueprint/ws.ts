/** WebSocket files — an in-memory relay plus a `/channels` endpoint. */
export function wsFiles(): Record<string, string> {
  return {
    "server/ws/_index.ws.ts": indexWsTs(),
    "server/ws/relay.ts": relayTs(),
    "server/ws/channels.ws.ts": channelsWsTs(),
  };
}

function indexWsTs(): string {
  return `import type { Howl } from "@hushkey/howl";
import type { State } from "../../howl.config.ts";
import channels from "./channels.ws.ts";

/** Registers every WebSocket endpoint — add one line per *.ws.ts file. */
export default (app: Howl<State>) => {
  app.configure(channels);
};
`;
}

function relayTs(): string {
  return `// In-memory relay: userId → open sockets (multi-tab safe).
// Single-process only — to fan out across instances, back publish() with a
// pub/sub (e.g. Redis) and deliver to local sockets on each message.
const connections = new Map<string, Set<WebSocket>>();

export const wsConnect = (userId: string, ws: WebSocket): void => {
  const sockets = connections.get(userId);
  if (sockets) sockets.add(ws);
  else connections.set(userId, new Set([ws]));
};

export const wsDisconnect = (userId: string, ws: WebSocket): void => {
  const sockets = connections.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) connections.delete(userId);
};

/** Push \`{ event, data }\` to every open socket of a user. Call from API handlers or services. */
export const publish = (userId: string, event: string, data: unknown): void => {
  const sockets = connections.get(userId);
  if (!sockets) return;
  const message = JSON.stringify({ event, data });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
};
`;
}

function channelsWsTs(): string {
  return `import type { Howl } from "@hushkey/howl";
import type { State } from "../../howl.config.ts";
import { wsConnect, wsDisconnect } from "./relay.ts";

export default (app: Howl<State>) => {
  app.ws("/channels", {
    open: (socket, ctx) => {
      // Placeholder identity: ?userId=... — replace with your auth middleware's
      // user (e.g. ctx.state.userContext?.user?.id) before going to production.
      const userId = ctx.query("userId");
      if (!userId) {
        socket.close(1008, "Unauthorized");
        return;
      }
      ctx.state.wsUserId = userId;
      wsConnect(userId, socket);
      const ping = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ event: "ping" }));
        } else {
          clearInterval(ping);
          wsDisconnect(userId, socket);
        }
      }, 30_000);
      socket.addEventListener("close", () => clearInterval(ping));
    },
    message: (_socket, event, ctx) => {
      // Client → server frames land here.
      console.info(\`[WS] message from \${ctx.state.wsUserId}:\`, event.data);
    },
    close: (socket, _code, _reason, ctx) => {
      const userId = ctx.state.wsUserId;
      if (userId) wsDisconnect(userId, socket);
    },
    error: (_socket, event, ctx) => {
      const msg = (event as ErrorEvent).message ?? "";
      if (msg.toLowerCase().includes("connection reset")) return;
      console.error(\`[WS] error for \${ctx.state.wsUserId}:\`, msg);
    },
  });
  console.info("[WS] /channels ← realtime");
};
`;
}
