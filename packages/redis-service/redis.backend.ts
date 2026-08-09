// deno-lint-ignore-file no-explicit-any
import {
  applyProjection,
  type BackendOpOptions,
  type DocumentShape,
  type Filter,
  type FindCapabilities,
  type FindManyOptions,
  normalizeProjection,
  type StorageBackend,
  type UpdatePathsOptions,
  uuidv7,
} from "@hushkey/service-core";
import { getPath, matchesFilter, sortDocuments } from "./filter.matcher.ts";
import {
  type IndexKind,
  indexMap,
  isIndexableValue,
  makeKeys,
  planFilter,
  type QueryPlan,
  type RedisIndexSpec,
  type RedisKeys,
} from "./query.planner.ts";

/**
 * The duck-typed Redis client the backend drives: one command dispatcher.
 * Every driver exposes one — `ioredis` as `call`, `node-redis` as
 * `sendCommand`, `@db/redis` as `sendCommand` — so a one-line adapter connects
 * any of them without this package depending on a driver.
 *
 * ```ts
 * const client = { sendCommand: (args) => redis.call(...args.map(String)) }; // ioredis
 * ```
 */
export interface RedisClientLike {
  /**
   * Send one command as an argument array (`["GET", key]`) and resolve its
   * reply. Bulk strings may come back as strings or bytes; both are handled.
   */
  sendCommand(args: (string | number)[]): Promise<unknown>;
}

/** Storage configuration for a {@link RedisBackend}. */
export interface RedisBackendOptions {
  /** The collection name (one collection = one key namespace). */
  collectionName: string;
  /** Global key prefix, namespacing the app (default `howl`). */
  keyPrefix?: string;
  /**
   * Document paths to give a physical secondary index — the Redis counterpart
   * of the SQL backends' `promote`. `tag` paths get a `SET` of ids per distinct
   * value (equality, `$in`); `number` paths get a `ZSET` scored by the value
   * (ranges, and server-side ordering). Everything else still queries
   * correctly, by scanning the collection and filtering in process.
   */
  index?: RedisIndexSpec[];
  /**
   * How many times a write retries when another writer touches the same
   * document mid-flight (default 3). Writes are compare-and-set; a retry is a
   * lost race, not an error.
   */
  maxRetries?: number;
}

// Compare-and-set write. Guards on the exact previous document bytes rather
// than a parsed version field: no cjson round-trip (which would rewrite arrays
// and empty objects), and it catches every concurrent write, not just those
// that bump `version`. Index maintenance rides inside the same script, so a
// document and its index entries can never diverge.
//
// KEYS[1] document key · ARGV: mode, expected, payload, then 4-tuples of
// (op, key, member, score). Returns 1 written · 0 absent/duplicate · -1 raced.
const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
local mode = ARGV[1]
if mode == 'insert' then
  if cur then return 0 end
else
  if not cur then return 0 end
  if cur ~= ARGV[2] then return -1 end
end
if mode == 'delete' then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], ARGV[3])
end
local i = 4
while i + 3 <= #ARGV do
  local op, key, member, score = ARGV[i], ARGV[i+1], ARGV[i+2], ARGV[i+3]
  if op == 'sadd' then redis.call('SADD', key, member)
  elseif op == 'srem' then redis.call('SREM', key, member)
  elseif op == 'zadd' then redis.call('ZADD', key, score, member)
  elseif op == 'zrem' then redis.call('ZREM', key, member)
  end
  i = i + 4
end
return 1
`;

/** One index mutation: `[operation, key, member, score]`. */
type IndexOp = [string, string, string, string];

const FETCH_CHUNK = 256;

function decode(reply: unknown): string | null {
  if (reply === null || reply === undefined) return null;
  if (typeof reply === "string") return reply;
  if (reply instanceof Uint8Array) return new TextDecoder().decode(reply);
  return String(reply);
}

function decodeList(reply: unknown): string[] {
  if (!Array.isArray(reply)) return [];
  return reply.map((r) => decode(r)).filter((r): r is string => r !== null);
}

function intersectIds(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((id) => set.has(id));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Deep-set a dotted path, creating missing parents — the same lost-write
// hazard the pg backend's plpgsql deep-set exists to avoid. A null VALUE is
// stored as null (the meta contract distinguishes it from an absent key).
// Parents are copied on the way down so the pre-image stays intact: the index
// diff compares it against the result.
function deepSet(root: Record<string, any>, path: string, value: unknown): void {
  const segments = path.split(".");
  let node = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const child = node[segments[i]];
    const copy = child && typeof child === "object" && !Array.isArray(child)
      ? { ...(child as Record<string, any>) }
      : {};
    node[segments[i]] = copy;
    node = copy;
  }
  node[segments[segments.length - 1]] = value;
}

/**
 * Redis implementation of the `@hushkey/service-core` storage contract —
 * Redis as the **database**, not a cache in front of one.
 *
 * Storage layout: one JSON string per document (`{prefix:collection}:d:<id>`),
 * a lexicographic `ZSET` of every id, a second `ZSET` of the ids that are not
 * soft-deleted, and one physical secondary index per declared path — a `SET`
 * of ids per distinct value (`tag`) or a `ZSET` scored by the value
 * (`number`). Queries compile to set operations the server runs (`ZINTER`,
 * `SUNION`, `ZRANGEBYSCORE`); whatever the indexes cannot answer is re-checked
 * in process against the fetched candidates, so every query is correct and the
 * index list is purely a performance knob.
 *
 * Writes are single-round-trip compare-and-set scripts that carry their index
 * updates, so a document and its indexes are always consistent and optimistic
 * locking is enforced server-side. No `WATCH`, no transactions to retry by
 * hand, and every key of a collection shares one hash tag — cluster-safe.
 *
 * Requires Redis 6.2+ (or a compatible server: Valkey, Dragonfly, Upstash) for
 * `ZINTER`/`ZMSCORE`. No modules — RedisJSON and RediSearch are not used.
 *
 * @typeParam T The public document shape.
 */
export class RedisBackend<T extends DocumentShape> implements StorageBackend<T> {
  /** Cache-key namespace for Redis-backed services. */
  readonly cachePrefix = "redis";

  /**
   * Projection, sorting and collation are applied to the fetched candidates
   * (Redis stores opaque JSON), and Redis has no query planner to hint.
   */
  readonly findCapabilities: FindCapabilities = {
    project: "approximate",
    sort: "approximate",
    collation: "approximate",
    hint: "none",
  };

  readonly #keys: RedisKeys;
  readonly #indexes: Map<string, IndexKind>;
  readonly #maxRetries: number;
  #scriptSha: string | null = null;

  /**
   * Create a backend over one Redis key namespace.
   *
   * @param client The duck-typed Redis client.
   * @param options Collection name, key prefix and the declared index list.
   */
  constructor(
    protected client: RedisClientLike,
    protected options: RedisBackendOptions,
  ) {
    this.#keys = makeKeys(options.keyPrefix ?? "howl", options.collectionName);
    this.#indexes = indexMap(options.index);
    this.#maxRetries = options.maxRetries ?? 3;
  }

  /** Generate a new document id — UUID v7, so ids sort by creation time. */
  generateId(): string {
    return uuidv7();
  }

  /**
   * Escape hatch: the underlying client for raw commands. Call sites using it
   * are permanently backend-specific and bypass the service contract.
   */
  get redis(): RedisClientLike {
    return this.client;
  }

  /** The key namespace this backend owns — useful for tooling and cleanup. */
  get keys(): RedisKeys {
    return this.#keys;
  }

  // ============================================================
  // Command helpers
  // ============================================================

  #send(...args: (string | number)[]): Promise<unknown> {
    return this.client.sendCommand(args);
  }

  // EVALSHA first, falling back to EVAL (and caching the digest) the first time
  // a server has not seen the script — the standard scripting handshake, which
  // also survives a server restart or SCRIPT FLUSH mid-process.
  async #runScript(key: string, argv: (string | number)[]): Promise<number> {
    if (this.#scriptSha) {
      try {
        const reply = await this.#send("EVALSHA", this.#scriptSha, 1, key, ...argv);
        return Number(decode(reply) ?? 0);
      } catch (error) {
        if (!String(error).includes("NOSCRIPT")) throw error;
        this.#scriptSha = null;
      }
    }
    const reply = await this.#send("EVAL", CAS_SCRIPT, 1, key, ...argv);
    this.#scriptSha ??= decode(await this.#send("SCRIPT", "LOAD", CAS_SCRIPT));
    return Number(decode(reply) ?? 0);
  }

  async #fetchDocs(ids: string[]): Promise<T[]> {
    const docs: T[] = [];
    for (const group of chunk(ids, FETCH_CHUNK)) {
      const replies = await this.#send("MGET", ...group.map((id) => this.#keys.doc(id)));
      for (const reply of Array.isArray(replies) ? replies : []) {
        const raw = decode(reply);
        // A null is a document deleted between planning and fetching — the
        // index entry is already gone, so drop it rather than surface a hole.
        if (raw !== null) docs.push(JSON.parse(raw) as T);
      }
    }
    return docs;
  }

  // ============================================================
  // Index maintenance
  // ============================================================

  #entries(doc: Record<string, any>): { sets: string[]; scores: Map<string, number> } {
    const sets: string[] = [];
    const scores = new Map<string, number>();
    for (const [path, kind] of this.#indexes) {
      const value = getPath(doc, path);
      if (value === undefined) continue;
      if (kind === "number") {
        if (typeof value === "number" && Number.isFinite(value)) {
          scores.set(this.#keys.number(path), value);
        }
        continue;
      }
      // Nulls and structured values get no entry — the planner never looks
      // them up (a null equality must also match absent keys, and object
      // equality is structural), so an entry would only cost writes.
      if (isIndexableValue(value)) sets.push(this.#keys.tag(path, value));
    }
    return { sets, scores };
  }

  #isActive(doc: Record<string, any>): boolean {
    return getPath(doc, "meta.deleted_at") === null ||
      getPath(doc, "meta.deleted_at") === undefined;
  }

  // The write ops that take the collection from `before` to `after`. Either
  // side may be null (insert / delete).
  #diff(
    id: string,
    before: Record<string, any> | null,
    after: Record<string, any> | null,
  ): IndexOp[] {
    const ops: IndexOp[] = [];
    const old = before ? this.#entries(before) : { sets: [], scores: new Map<string, number>() };
    const next = after ? this.#entries(after) : { sets: [], scores: new Map<string, number>() };

    const nextSets = new Set(next.sets);
    const oldSets = new Set(old.sets);
    for (const key of nextSets) if (!oldSets.has(key)) ops.push(["sadd", key, id, ""]);
    for (const key of oldSets) if (!nextSets.has(key)) ops.push(["srem", key, id, ""]);
    for (const [key, score] of next.scores) {
      if (old.scores.get(key) !== score) ops.push(["zadd", key, id, String(score)]);
    }
    for (const key of old.scores.keys()) {
      if (!next.scores.has(key)) ops.push(["zrem", key, id, ""]);
    }

    if (!after) {
      ops.push(["zrem", this.#keys.ids, id, ""], ["zrem", this.#keys.active, id, ""]);
      return ops;
    }
    if (!before) ops.push(["zadd", this.#keys.ids, id, "0"]);
    const activeNow = this.#isActive(after);
    if (!before || this.#isActive(before) !== activeNow) {
      ops.push([activeNow ? "zadd" : "zrem", this.#keys.active, id, "0"]);
    }
    return ops;
  }

  #flatten(ops: IndexOp[]): string[] {
    return ops.flat();
  }

  // ============================================================
  // StorageBackend operations
  // ============================================================

  /** Insert one document. Fails when the id is already taken. */
  async insertOne(doc: T, _options?: BackendOpOptions): Promise<void> {
    const record = doc as unknown as Record<string, any>;
    const id = record.id as string;
    const payload = JSON.stringify(record);
    const result = await this.#runScript(this.#keys.doc(id), [
      "insert",
      "",
      payload,
      ...this.#flatten(this.#diff(id, null, record)),
    ]);
    if (result !== 1) {
      throw new Error(`[redis] document "${id}" already exists in ${this.options.collectionName}`);
    }
  }

  /** Find the first match for a neutral filter, or null. */
  async findOne(filter: Filter<T>, options?: BackendOpOptions): Promise<T | null> {
    const [doc] = await this.findMany(filter, { ...options, limit: 1 });
    return doc ?? null;
  }

  /** Find every match for a neutral filter, honoring the options. */
  async findMany(filter: Filter<T>, options: FindManyOptions = {}): Promise<T[]> {
    const query = (filter ?? {}) as Record<string, unknown>;
    const plan = planFilter(query, this.#indexes, this.#keys);
    const sort = options.sort ?? {};
    const projection = normalizeProjection(options.project, options.select);
    const project = (docs: T[]) =>
      projection ? docs.map((d) => applyProjection(d, projection)) : docs;

    // Fast path — nothing to intersect, nothing to re-check, and the requested
    // order is the id order the base ZSET already holds: Redis returns exactly
    // one page. This is the default collection listing.
    const idDirection = idOnlySort(sort);
    if (plan.scan && plan.exact && idDirection !== null) {
      const ids = await this.#pageBase(plan.base, idDirection === -1, options.skip, options.limit);
      return project(await this.#fetchDocs(ids));
    }

    const candidates = await this.#candidates(plan);
    let docs = await this.#fetchDocs(candidates);
    if (!plan.exact) docs = docs.filter((d) => matchesFilter(d, query));
    const strength = options.collation?.strength ?? 3;
    sortDocuments(docs, sort, { caseInsensitive: !!options.collation && strength <= 2 });
    const skip = options.skip ?? 0;
    const end = options.limit === undefined ? undefined : skip + options.limit;
    return project(docs.slice(skip, end));
  }

  /** Count matches for a neutral filter. */
  async count(filter: Filter<T>, _options?: BackendOpOptions): Promise<number> {
    const query = (filter ?? {}) as Record<string, unknown>;
    const plan = planFilter(query, this.#indexes, this.#keys);
    // A whole-collection count is a single ZCARD — no documents leave Redis.
    if (plan.scan && plan.exact) return Number(decode(await this.#send("ZCARD", plan.base)) ?? 0);
    const candidates = await this.#candidates(plan);
    if (plan.exact) return candidates.length;
    const docs = await this.#fetchDocs(candidates);
    return docs.filter((d) => matchesFilter(d, query)).length;
  }

  /**
   * Apply dotted-path updates to one document, atomically with its index
   * updates and the optional version bump/lock. Returns the post-update
   * document, or null when no document matched (absent id or failed
   * `expectedVersion`).
   */
  async updatePaths(
    id: string,
    paths: Record<string, unknown>,
    options: UpdatePathsOptions = {},
  ): Promise<T | null> {
    return await this.#rewrite(id, (current) => {
      if (
        options.expectedVersion !== undefined &&
        (current as Record<string, any>).version !== options.expectedVersion
      ) {
        return null;
      }
      const next = { ...(current as Record<string, any>) };
      for (const [path, value] of Object.entries(paths)) {
        if (value === undefined) continue;
        deepSet(next, path, value);
      }
      if (options.bumpVersion !== false) next.version = (next.version ?? 0) + 1;
      return next;
    });
  }

  /** Hard-delete one document by id. Returns the deleted document, or null. */
  async deleteOne(id: string, _options?: BackendOpOptions): Promise<T | null> {
    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      const raw = decode(await this.#send("GET", this.#keys.doc(id)));
      if (raw === null) return null;
      const current = JSON.parse(raw) as Record<string, any>;
      const result = await this.#runScript(this.#keys.doc(id), [
        "delete",
        raw,
        "",
        ...this.#flatten(this.#diff(id, current, null)),
      ]);
      if (result === 1) return current as T;
      if (result === 0) return null;
    }
    throw new Error(
      `[redis] delete of "${id}" lost ${this.#maxRetries} races; retry the operation`,
    );
  }

  /**
   * Remove a top-level field from every document that has it, updating any
   * index entries it fed. Scans the collection — a maintenance primitive, not
   * a query path.
   *
   * @param field The top-level JSON key to remove.
   * @param _options Backend op options (unused — Redis has no session here).
   * @returns The number of documents the key was removed from.
   */
  async unsetField(field: string, _options?: BackendOpOptions): Promise<number> {
    const ids = decodeList(await this.#send("ZRANGE", this.#keys.ids, 0, -1));
    let removed = 0;
    for (const group of chunk(ids, FETCH_CHUNK)) {
      const docs = await this.#fetchDocs(group);
      for (const doc of docs) {
        const record = doc as unknown as Record<string, any>;
        if (!(field in record)) continue;
        const updated = await this.#rewrite(record.id as string, (current) => {
          const next = { ...(current as Record<string, any>) };
          if (!(field in next)) return null;
          delete next[field];
          return next;
        });
        if (updated) removed++;
      }
    }
    return removed;
  }

  // ============================================================
  // Internals
  // ============================================================

  // Read-modify-write under compare-and-set: `mutate` returns the next
  // document, or null to abort (no match / nothing to do). A lost race re-reads
  // and re-applies, so concurrent writers to the same document serialize
  // instead of clobbering.
  async #rewrite(
    id: string,
    mutate: (current: Record<string, any>) => Record<string, any> | null,
  ): Promise<T | null> {
    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      const raw = decode(await this.#send("GET", this.#keys.doc(id)));
      if (raw === null) return null;
      const current = JSON.parse(raw) as Record<string, any>;
      const next = mutate(current);
      if (next === null) return null;
      const result = await this.#runScript(this.#keys.doc(id), [
        "update",
        raw,
        JSON.stringify(next),
        ...this.#flatten(this.#diff(id, current, next)),
      ]);
      if (result === 1) return next as T;
      if (result === 0) return null;
    }
    throw new Error(`[redis] write to "${id}" lost ${this.#maxRetries} races; retry the operation`);
  }

  // One page straight out of the base ZSET — every member scores 0, so BYLEX
  // order is id order (and uuidv7 ids are time-ordered).
  async #pageBase(
    base: string,
    reverse: boolean,
    skip = 0,
    limit?: number,
  ): Promise<string[]> {
    const args: (string | number)[] = reverse
      ? ["ZRANGE", base, "+", "-", "BYLEX", "REV"]
      : ["ZRANGE", base, "-", "+", "BYLEX"];
    args.push("LIMIT", skip, limit ?? -1);
    return decodeList(await this.#send(...args));
  }

  // Resolve a plan to candidate ids, doing as much as possible server-side.
  async #candidates(plan: QueryPlan): Promise<string[]> {
    const intersect = plan.sources.find((s) => s.kind === "intersect");
    const others = plan.sources.filter((s) => s.kind !== "intersect");

    let ids: string[] | null = null;
    let baseApplied = false;
    if (intersect && intersect.kind === "intersect") {
      // ZINTER accepts plain SETs (scored 1), so the base ZSET and the tag SETs
      // intersect in a single server-side command.
      const keys = [plan.base, ...intersect.keys];
      ids = decodeList(await this.#send("ZINTER", keys.length, ...keys));
      baseApplied = true;
    }

    for (const source of others) {
      const list = source.kind === "union"
        ? decodeList(await this.#send("SUNION", ...source.keys))
        : decodeList(
          await this.#send("ZRANGEBYSCORE", source.key, source.min, source.max),
        );
      ids = ids === null ? list : intersectIds(ids, list);
    }

    if (ids === null) return decodeList(await this.#send("ZRANGE", plan.base, 0, -1));
    if (!baseApplied) ids = await this.#restrictToBase(plan.base, ids);
    return ids;
  }

  // Keep only ids that are members of the base set — one ZMSCORE per chunk
  // instead of pulling the whole base down to intersect locally.
  async #restrictToBase(base: string, ids: string[]): Promise<string[]> {
    const kept: string[] = [];
    for (const group of chunk(ids, FETCH_CHUNK)) {
      const scores = await this.#send("ZMSCORE", base, ...group);
      const list = Array.isArray(scores) ? scores : [];
      group.forEach((id, i) => {
        if (list[i] !== null && list[i] !== undefined) kept.push(id);
      });
    }
    return kept;
  }
}

// `{}`, `{ id: 1 }` and `{ id: -1 }` are the orders the base ZSET already
// holds; anything else needs the documents in memory to sort.
function idOnlySort(sort: Record<string, 1 | -1>): 1 | -1 | null {
  const entries = Object.entries(sort);
  if (entries.length === 0) return 1;
  if (entries.length === 1 && entries[0][0] === "id") return entries[0][1];
  return null;
}
