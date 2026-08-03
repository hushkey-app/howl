import { expect } from "@std/expect";
import { DevReloadHub } from "../../dev/middlewares/live_reload.ts";

interface SentMessage {
  type: string;
  revision: number;
}

/** Minimal stand-in for the browser end of `/_howl/alive`. */
class FakeSocket extends EventTarget {
  readyState = WebSocket.OPEN;
  sent: SentMessage[] = [];

  send(data: string): void {
    if (this.readyState !== WebSocket.OPEN) throw new Error("socket closed");
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }

  asWebSocket(): WebSocket {
    return this as unknown as WebSocket;
  }
}

Deno.test("DevReloadHub — greets a connecting client with the current revision", () => {
  const hub = new DevReloadHub();
  const socket = new FakeSocket();

  hub.add(socket.asWebSocket());

  expect(socket.sent.length).toBe(1);
  expect(socket.sent[0].type).toBe("initial-state");
  expect(socket.sent[0].revision).toBe(hub.revision);
  expect(hub.clientCount).toBe(1);
});

Deno.test("DevReloadHub — notifyReload pushes a higher revision to every client", () => {
  const hub = new DevReloadHub();
  const a = new FakeSocket();
  const b = new FakeSocket();
  hub.add(a.asWebSocket());
  hub.add(b.asWebSocket());

  const before = hub.revision;
  hub.notifyReload();

  expect(hub.revision).toBeGreaterThan(before);
  for (const socket of [a, b]) {
    expect(socket.sent.length).toBe(2);
    expect(socket.sent[1].revision).toBe(hub.revision);
  }
});

Deno.test("DevReloadHub — back-to-back rebuilds still bump the revision", () => {
  // The client only reloads on a strictly higher revision, so two rebuilds
  // inside the same millisecond must not collapse into one.
  const hub = new DevReloadHub();
  const socket = new FakeSocket();
  hub.add(socket.asWebSocket());

  hub.notifyReload();
  const first = hub.revision;
  hub.notifyReload();

  expect(hub.revision).toBeGreaterThan(first);
  expect(socket.sent.map((m) => m.revision)).toEqual([
    socket.sent[0].revision,
    first,
    hub.revision,
  ]);
});

Deno.test("DevReloadHub — a closed client is dropped", () => {
  const hub = new DevReloadHub();
  const gone = new FakeSocket();
  const alive = new FakeSocket();
  hub.add(gone.asWebSocket());
  hub.add(alive.asWebSocket());

  gone.close();
  expect(hub.clientCount).toBe(1);

  hub.notifyReload();
  expect(gone.sent.length).toBe(1);
  expect(alive.sent.length).toBe(2);
});

Deno.test("DevReloadHub — a socket that dies mid-broadcast does not break the rest", () => {
  const hub = new DevReloadHub();
  const broken = new FakeSocket();
  const alive = new FakeSocket();
  hub.add(broken.asWebSocket());
  hub.add(alive.asWebSocket());

  // Dies without firing `close` — send() throws while readyState still says OPEN.
  broken.send = () => {
    throw new Error("broken pipe");
  };

  hub.notifyReload();

  expect(alive.sent.length).toBe(2);
  expect(hub.clientCount).toBe(1);
});
