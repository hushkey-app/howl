import type { CacheAdapter } from "../../cache/cache.interface.ts";

/**
 * Redis cache adapter.
 *
 * Wraps a Redis client for cache and owns the collection version key
 * (mongo:{collectionName}:version). MongoService uses getVersion/incrementVersion
 * when present for multi-process cache invalidation.
 */
// In-process cache for the table version key. Avoids a Redis GET on every
// find/get just to read the version. TTL is short so cross-process bumps via
// incrementVersion are picked up within ~1s.
const VERSION_CACHE_TTL_MS = 1000;

/**
 * Redis-backed cache adapter. Wraps a duck-typed Redis client and owns the
 * shared collection version key (`<keyPrefix>:<collection>:version`) the
 * service layer uses for cross-instance versioned invalidation.
 */
export class RedisCacheAdapter implements CacheAdapter {
  private readonly versionKey: string;
  /**
   * Namespace for every key this adapter owns (version key, patternless
   * `clear()` scope). Must match the backend's `cachePrefix` — the core
   * service verifies this at construction and throws on mismatch.
   */
  readonly keyPrefix: string;
  private versionCache: { value: number; expires: number } | null = null;

  /**
   * Create an adapter over a Redis client for one collection.
   *
   * @param redis A Redis client, duck-typed: needs `get`, `set`, `del`,
   *   `mget`, `scan`, and `incr`.
   * @param collectionName The collection this adapter's version key tracks.
   * @param keyPrefix Namespace for the version key and patternless `clear()`;
   *   must match the prefix the service layer bakes into its cache keys
   *   (`mongo` for {@link MongoService}).
   */
  constructor(
    private redis: any,
    collectionName: string,
    keyPrefix = "mongo",
  ) {
    if (!redis) {
      throw new Error("Redis client is required");
    }
    this.keyPrefix = keyPrefix;
    this.versionKey = `${keyPrefix}:${collectionName}:version`;
  }

  /**
   * Read the collection version, cached in-process for ~1s to avoid a Redis
   * GET on every read. Cross-process bumps are picked up within that window.
   *
   * @returns The current collection version (0 if unset).
   */
  async getVersion(): Promise<number> {
    const now = Date.now();
    if (this.versionCache && this.versionCache.expires > now) {
      return this.versionCache.value;
    }
    const v = await this.redis.get(this.versionKey);
    const parsed = parseInt(v ?? "0", 10);
    this.versionCache = { value: parsed, expires: now + VERSION_CACHE_TTL_MS };
    return parsed;
  }

  /**
   * Atomically bump the collection version (`INCR`), orphaning every cache key
   * built under the previous version. Refreshes the in-process cache.
   *
   * @returns The new version.
   */
  async incrementVersion(): Promise<number> {
    const next = await this.redis.incr(this.versionKey);
    // Refresh local cache immediately so the next read in this process sees
    // the new version without waiting for the TTL window.
    this.versionCache = { value: next, expires: Date.now() + VERSION_CACHE_TTL_MS };
    return next;
  }

  /**
   * Get and JSON-parse a value. Returns null on miss, parse failure, or any
   * Redis error (degrades to a cache miss).
   *
   * @param key The cache key.
   * @returns The parsed value, or null.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=cache adapter contract; redis unavailable or parse failure → null (cache miss)
      return null;
    }
  }

  /**
   * Batch get + JSON-parse in one round trip. Returns an array aligned to
   * `keys` with null for misses, per-item parse failures, or a Redis error.
   *
   * @param keys The cache keys.
   * @returns Parsed values aligned to `keys`, null where absent.
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    try {
      const values: (string | null)[] = await this.redis.mget(...keys);
      return values.map((v) => {
        if (!v) return null;
        try {
          return JSON.parse(v) as T;
        } catch {
          //@silent-catch decided=2026-05-21 reason=per-item parse failure in batch; nullable position preserved
          return null;
        }
      });
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=redis mget unavailable; returns array of nulls per cache-adapter contract
      return keys.map(() => null);
    }
  }

  /**
   * JSON-serialize and store a value, with an optional TTL in seconds.
   *
   * @param key The cache key.
   * @param value The value to store.
   * @param ttl Time to live in seconds; omit for no expiry.
   * @returns true on success, false on any Redis error.
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.redis.set(key, serialized, "EX", ttl);
      } else {
        await this.redis.set(key, serialized);
      }
      return true;
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=cache adapter contract; redis write failure → false (boolean result)
      return false;
    }
  }

  /**
   * Delete a single key.
   *
   * @param key The cache key.
   * @returns true if a key was removed, false otherwise.
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      return result === 1;
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=cache adapter contract; redis delete failure → false (boolean result)
      return false;
    }
  }

  /**
   * Delete keys matching a glob pattern via `SCAN` (never `KEYS`). With no
   * pattern, clears only this adapter's `keyPrefix` namespace — never the whole
   * (shared) Redis database.
   *
   * @param pattern A Redis match pattern; defaults to `<keyPrefix>:*`.
   * @returns The number of keys deleted.
   */
  async clear(pattern?: string): Promise<number> {
    try {
      // No pattern = clear this layer's cache namespace, never the whole DB.
      // The Redis instance is shared with queues/sessions — KEYS('*') + DEL
      // here would wipe them too.
      const effectivePattern = pattern || `${this.keyPrefix}:*`;

      // Pattern-based clearing using SCAN for better performance
      const keys: string[] = [];
      let cursor = "0";

      do {
        const [nextCursor, foundKeys] = await this.redis.scan(
          cursor,
          "MATCH",
          effectivePattern,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        keys.push(...foundKeys);
      } while (cursor !== "0");

      if (keys.length === 0) {
        return 0;
      }

      await this.redis.del(...keys);
      return keys.length;
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=cache adapter contract; redis scan/del failure → 0 (count result)
      return 0;
    }
  }
}
