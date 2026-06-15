import type { CacheAdapter } from "./cache.interface.ts";

/**
 * Cache entry with expiration timestamp
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory LRU cache adapter with TTL support
 *
 * Features:
 * - LRU eviction when max size reached
 * - TTL expiration
 * - Pattern-based clearing
 * - Fast in-process lookups
 */
export class InMemoryLRUCache implements CacheAdapter {
  private cache: Map<string, CacheEntry<any>>;
  private accessOrder: Map<string, number>; // For LRU tracking
  private accessCounter: number = 0;
  private readonly maxSize: number;

  /**
   * Create an empty cache.
   *
   * @param maxSize Maximum number of entries before LRU eviction kicks in.
   */
  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = new Map();
  }

  /**
   * Get a value, refreshing its LRU recency. Returns null on miss or expiry.
   *
   * @param key The cache key.
   * @returns The cached value, or null.
   */
  get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return Promise.resolve(null);
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return Promise.resolve(null);
    }

    // Update access order for LRU
    this.accessCounter++;
    this.accessOrder.set(key, this.accessCounter);

    return Promise.resolve(entry.value as T);
  }

  /**
   * Store a value, evicting the least-recently-used entry if at capacity.
   *
   * @param key The cache key.
   * @param value The value to store.
   * @param ttl Time to live in seconds; omit to never expire.
   * @returns true on success.
   */
  set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      // If at max size, evict least recently used
      if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
        this.evictLRU();
      }

      const expiresAt = ttl ? Date.now() + ttl * 1000 : Number.MAX_SAFE_INTEGER; // Never expire if no TTL

      this.cache.set(key, { value, expiresAt });
      this.accessCounter++;
      this.accessOrder.set(key, this.accessCounter);

      return Promise.resolve(true);
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=cache adapter contract; in-memory set defensive failure → false (boolean result)
      return Promise.resolve(false);
    }
  }

  /**
   * Delete a single key.
   *
   * @param key The cache key.
   * @returns true if the key existed.
   */
  delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    this.accessOrder.delete(key);
    return Promise.resolve(deleted);
  }

  /**
   * Delete entries matching a glob pattern (`*` and `?`), or all entries when
   * no pattern is given. Regex metacharacters in the pattern are escaped.
   *
   * @param pattern A glob pattern; omit to clear everything.
   * @returns The number of entries deleted.
   */
  clear(pattern?: string): Promise<number> {
    if (!pattern) {
      const count = this.cache.size;
      this.cache.clear();
      this.accessOrder.clear();
      return Promise.resolve(count);
    }

    // Pattern-based clearing (supports wildcards * and ?). Escape regex
    // metacharacters first so a literal '.' or '+' in a key pattern doesn't
    // act as a regex operator and over-match.
    let deleted = 0;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      "^" + escaped.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    );

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        deleted++;
      }
    }

    return Promise.resolve(deleted);
  }

  /**
   * Evict the least recently used entry
   * @private
   */
  private evictLRU(): void {
    if (this.accessOrder.size === 0) {
      return;
    }

    // Find the key with the lowest access counter (least recently used)
    let lruKey: string | null = null;
    let minCounter = Number.MAX_SAFE_INTEGER;

    for (const [key, counter] of this.accessOrder.entries()) {
      if (counter < minCounter) {
        minCounter = counter;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
  }

  /**
   * Get current cache size (for debugging/monitoring)
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Clear all expired entries (cleanup method)
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}
