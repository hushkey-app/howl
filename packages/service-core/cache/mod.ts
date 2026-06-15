/**
 * Cache adapter contract and the bundled in-memory LRU implementation used as
 * the default fallback when caching is enabled without an explicit adapter.
 *
 * @module
 */
export type { CacheAdapter, CacheOptions } from "./cache.interface.ts";
export { InMemoryLRUCache } from "./in-memory-cache.adapter.ts";
