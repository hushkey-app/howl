import type { RedisClientLike } from "../mod.ts";

// A tiny in-memory Redis stand-in — only the commands RedisBackend sends:
// GET/SET/DEL/MGET, the SET and ZSET operations the indexes use, and the
// compare-and-set script. Not a Redis emulator; enough to run the whole
// contract without infra, the way _fake_mongo.ts does for Mongo. Real-server
// conformance (including the Lua itself) is the REDIS_URL-gated suite.

type Args = (string | number)[];

function sortedMembers(entries: Map<string, number>): string[] {
  // Redis orders a sorted set by score, then lexicographically by member.
  return [...entries.entries()]
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([member]) => member);
}

function parseScoreBound(bound: string): { value: number; exclusive: boolean } {
  if (bound === "-inf") return { value: -Infinity, exclusive: false };
  if (bound === "+inf") return { value: Infinity, exclusive: false };
  if (bound.startsWith("(")) return { value: Number(bound.slice(1)), exclusive: true };
  return { value: Number(bound), exclusive: false };
}

/** In-memory Redis double implementing the backend's command surface. */
export class FakeRedis implements RedisClientLike {
  strings = new Map<string, string>();
  sets = new Map<string, Set<string>>();
  zsets = new Map<string, Map<string, number>>();
  /** Every command received, for assertions about what ran server-side. */
  commands: string[][] = [];

  #set(key: string): Set<string> {
    let value = this.sets.get(key);
    if (!value) this.sets.set(key, value = new Set());
    return value;
  }

  #zset(key: string): Map<string, number> {
    let value = this.zsets.get(key);
    if (!value) this.zsets.set(key, value = new Map());
    return value;
  }

  #prune(key: string): void {
    if (this.sets.get(key)?.size === 0) this.sets.delete(key);
    if (this.zsets.get(key)?.size === 0) this.zsets.delete(key);
  }

  // Members of a key regardless of whether it is a SET or a ZSET — what
  // ZINTER does (it treats a set as a sorted set scored 1).
  #members(key: string): Set<string> {
    const zset = this.zsets.get(key);
    if (zset) return new Set(zset.keys());
    return new Set(this.sets.get(key) ?? []);
  }

  sendCommand(args: Args): Promise<unknown> {
    const parts = args.map(String);
    this.commands.push(parts);
    const [name, ...rest] = parts;
    return Promise.resolve(this.#dispatch(name.toUpperCase(), rest));
  }

  #dispatch(name: string, args: string[]): unknown {
    switch (name) {
      case "GET":
        return this.strings.get(args[0]) ?? null;
      case "SET":
        this.strings.set(args[0], args[1]);
        return "OK";
      case "DEL":
        return args.filter((key) => this.strings.delete(key)).length;
      case "MGET":
        return args.map((key) => this.strings.get(key) ?? null);
      case "SADD": {
        const set = this.#set(args[0]);
        const before = set.size;
        for (const member of args.slice(1)) set.add(member);
        return set.size - before;
      }
      case "SREM": {
        const set = this.#set(args[0]);
        const removed = args.slice(1).filter((member) => set.delete(member)).length;
        this.#prune(args[0]);
        return removed;
      }
      case "SUNION": {
        const out = new Set<string>();
        for (const key of args) for (const member of this.#members(key)) out.add(member);
        return [...out];
      }
      case "ZADD": {
        const zset = this.#zset(args[0]);
        let added = 0;
        for (let i = 1; i + 1 < args.length; i += 2) {
          if (!zset.has(args[i + 1])) added++;
          zset.set(args[i + 1], Number(args[i]));
        }
        return added;
      }
      case "ZREM": {
        const zset = this.#zset(args[0]);
        const removed = args.slice(1).filter((member) => zset.delete(member)).length;
        this.#prune(args[0]);
        return removed;
      }
      case "ZCARD":
        return this.zsets.get(args[0])?.size ?? 0;
      case "ZMSCORE": {
        const zset = this.zsets.get(args[0]);
        return args.slice(1).map((member) => {
          const score = zset?.get(member);
          return score === undefined ? null : String(score);
        });
      }
      case "ZINTER": {
        const count = Number(args[0]);
        const keys = args.slice(1, 1 + count);
        if (keys.length === 0) return [];
        const [first, ...others] = keys;
        let ids = [...this.#members(first)];
        for (const key of others) {
          const members = this.#members(key);
          ids = ids.filter((id) => members.has(id));
        }
        // The first key here is always the base ZSET, so its order carries.
        const order = this.zsets.get(first);
        return order ? sortedMembers(order).filter((id) => ids.includes(id)) : ids.sort();
      }
      case "ZRANGEBYSCORE": {
        const zset = this.zsets.get(args[0]);
        if (!zset) return [];
        const min = parseScoreBound(args[1]);
        const max = parseScoreBound(args[2]);
        const kept = new Map<string, number>();
        for (const [member, score] of zset) {
          if (min.exclusive ? score <= min.value : score < min.value) continue;
          if (max.exclusive ? score >= max.value : score > max.value) continue;
          kept.set(member, score);
        }
        return sortedMembers(kept);
      }
      case "ZRANGE":
        return this.#zrange(args);
      case "SCRIPT":
        return "fake-sha";
      // EVAL arrives as [script, numkeys, key, ...argv] once the command name
      // is stripped (EVALSHA the same with a digest) — slice to the key.
      case "EVAL":
      case "EVALSHA":
        return this.#cas(args.slice(2));
      default:
        throw new Error(`FakeRedis: unsupported command ${name}`);
    }
  }

  #zrange(args: string[]): string[] {
    const members = sortedMembers(this.zsets.get(args[0]) ?? new Map());
    const byLex = args.includes("BYLEX");
    if (!byLex) {
      const start = Number(args[1]);
      const stop = Number(args[2]);
      const end = stop < 0 ? members.length + stop + 1 : stop + 1;
      return members.slice(start < 0 ? members.length + start : start, end);
    }
    const ordered = args.includes("REV") ? [...members].reverse() : members;
    const limitAt = args.indexOf("LIMIT");
    if (limitAt < 0) return ordered;
    const offset = Number(args[limitAt + 1]);
    const count = Number(args[limitAt + 2]);
    return count < 0 ? ordered.slice(offset) : ordered.slice(offset, offset + count);
  }

  // The backend's only script: compare-and-set on the document bytes, then a
  // flat list of (op, key, member, score) index mutations. Kept behaviourally
  // in step with CAS_SCRIPT by the real-server suite.
  #cas(argv: string[]): number {
    const [key, mode, expected, payload] = [argv[0], argv[1], argv[2], argv[3]];
    const current = this.strings.get(key) ?? null;
    if (mode === "insert") {
      if (current !== null) return 0;
    } else {
      if (current === null) return 0;
      if (current !== expected) return -1;
    }
    if (mode === "delete") this.strings.delete(key);
    else this.strings.set(key, payload);

    for (let i = 4; i + 3 < argv.length; i += 4) {
      const [op, target, member, score] = [argv[i], argv[i + 1], argv[i + 2], argv[i + 3]];
      switch (op) {
        case "sadd":
          this.#set(target).add(member);
          break;
        case "srem":
          this.#set(target).delete(member);
          this.#prune(target);
          break;
        case "zadd":
          this.#zset(target).set(member, Number(score));
          break;
        case "zrem":
          this.#zset(target).delete(member);
          this.#prune(target);
          break;
      }
    }
    return 1;
  }
}
