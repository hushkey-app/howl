import type { RedisClientLike } from "../mod.ts";

// A ~100-line RESP2 client, so the real-server suite needs no driver
// dependency — and doubles as proof of how small the `RedisClientLike` surface
// is. Production code brings ioredis/node-redis/@db/redis instead.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeCommand(args: (string | number)[]): Uint8Array {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const value = String(arg);
    out += `$${encoder.encode(value).length}\r\n${value}\r\n`;
  }
  return encoder.encode(out);
}

/** Minimal RESP2 client over a TCP socket. */
export class RespClient implements RedisClientLike {
  #conn: Deno.TcpConn;
  #buffer = new Uint8Array(0);
  // Commands serialize: one request in flight, replies read in order.
  #tail: Promise<unknown> = Promise.resolve();

  private constructor(conn: Deno.TcpConn) {
    this.#conn = conn;
  }

  /**
   * Connect to a `redis://host:port` URL.
   *
   * @param url The Redis URL.
   * @returns A connected client.
   */
  static async connect(url: string): Promise<RespClient> {
    const parsed = new URL(url);
    const conn = await Deno.connect({
      hostname: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port || 6379),
    });
    return new RespClient(conn);
  }

  /** Send one command and resolve its reply. */
  sendCommand(args: (string | number)[]): Promise<unknown> {
    const result = this.#tail.then(() => this.#exchange(args));
    // Keep the chain alive after a rejected command so later commands still run.
    this.#tail = result.catch(() => {});
    return result;
  }

  /** Close the socket. */
  close(): void {
    this.#conn.close();
  }

  async #exchange(args: (string | number)[]): Promise<unknown> {
    await this.#conn.write(encodeCommand(args));
    return await this.#reply();
  }

  async #fill(): Promise<void> {
    const chunk = new Uint8Array(64 * 1024);
    const read = await this.#conn.read(chunk);
    if (read === null) throw new Error("redis connection closed");
    const merged = new Uint8Array(this.#buffer.length + read);
    merged.set(this.#buffer);
    merged.set(chunk.subarray(0, read), this.#buffer.length);
    this.#buffer = merged;
  }

  async #line(): Promise<string> {
    for (;;) {
      for (let i = 0; i + 1 < this.#buffer.length; i++) {
        if (this.#buffer[i] === 13 && this.#buffer[i + 1] === 10) {
          const line = decoder.decode(this.#buffer.subarray(0, i));
          this.#buffer = this.#buffer.slice(i + 2);
          return line;
        }
      }
      await this.#fill();
    }
  }

  async #bulk(length: number): Promise<string> {
    while (this.#buffer.length < length + 2) await this.#fill();
    const value = decoder.decode(this.#buffer.slice(0, length));
    this.#buffer = this.#buffer.slice(length + 2);
    return value;
  }

  async #reply(): Promise<unknown> {
    const line = await this.#line();
    const payload = line.slice(1);
    switch (line[0]) {
      case "+":
        return payload;
      case "-":
        throw new Error(payload);
      case ":":
        return Number(payload);
      case "$": {
        const length = Number(payload);
        return length === -1 ? null : await this.#bulk(length);
      }
      case "*": {
        const count = Number(payload);
        if (count === -1) return null;
        const items: unknown[] = [];
        for (let i = 0; i < count; i++) items.push(await this.#reply());
        return items;
      }
      default:
        throw new Error(`unexpected RESP reply: ${line}`);
    }
  }
}

/** Delete every key under a hash-tag prefix (test teardown). */
export async function deleteKeys(client: RedisClientLike, pattern: string): Promise<void> {
  let cursor = "0";
  do {
    const reply = await client.sendCommand(["SCAN", cursor, "MATCH", pattern, "COUNT", 1000]);
    const [next, keys] = reply as [string, string[]];
    cursor = next;
    if (keys.length > 0) await client.sendCommand(["DEL", ...keys]);
  } while (cursor !== "0");
}
