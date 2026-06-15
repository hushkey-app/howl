/**
 * Redis-backed cache adapter. Wraps a duck-typed Redis client and owns the
 * shared collection version key used for cross-instance cache invalidation.
 *
 * @module
 */
export { RedisCacheAdapter } from "./redis-cache.adapter.ts";
