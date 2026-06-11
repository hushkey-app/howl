/**
 * Cache adapter interface for query result caching
 *
 * Implementations can be in-memory LRU, Redis, or any custom cache solution.
 * Adapters may optionally implement getVersion/incrementVersion for shared
 * cache version (e.g. RedisCacheAdapter) — MongoService uses duck typing.
 */
export interface CacheAdapter {
  /**
   * Get a value from cache
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Get many values from cache in a single round trip
   * @param keys - Cache keys
   * @returns Array of cached values (null where missing), in input order
   */
  mget?<T>(keys: string[]): Promise<(T | null)[]>;

  /**
   * Set a value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (optional)
   * @returns true if successful, false otherwise
   */
  set<T>(key: string, value: T, ttl?: number): Promise<boolean>;

  /**
   * Delete a specific key from cache
   * @param key - Cache key to delete
   * @returns true if deleted, false otherwise
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear cache entries matching a pattern
   * @param pattern - Pattern to match (e.g., 'mongo:users:*')
   * @returns Number of keys deleted
   */
  clear(pattern?: string): Promise<number>;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Enable caching (default: false - opt-in only) */
  enabled?: boolean;
  /** Custom cache adapter (defaults to in-memory LRU if enabled and no adapter provided) */
  adapter?: CacheAdapter;
  /** Default TTL in seconds (default: 300 = 5 minutes) */
  ttl?: number;
  /** Maximum cache size for LRU cache (default: 1000 entries) */
  maxSize?: number;
  /** Cache find() queries (default: true) */
  cacheFind?: boolean;
  /** Cache get() queries (default: true) */
  cacheGet?: boolean;
}
