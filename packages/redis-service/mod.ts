/**
 * `@hushkey/redis-service` — the Redis backend for the hushkey document-store
 * service layer. Redis as the **database**: documents live in Redis, queries
 * run as set operations there, and nothing sits in front of it.
 *
 * The rung of the storage ladder you climb to for latency rather than size.
 * {@link RedisService} wires the {@link RedisBackend} into the core
 * `DocumentService` contract from `@hushkey/service-core`, so the same service
 * code moves to `@hushkey/pg-service` or `@hushkey/mongo-service` unchanged.
 *
 * Storage: one JSON string per document, a lexicographic `ZSET` of every id, a
 * second `ZSET` of the ids that are not soft-deleted, and one physical index
 * per declared path — a `SET` of ids per value (`tag`) or a `ZSET` scored by
 * the value (`number`). The planner compiles the neutral filter grammar into
 * `ZINTER` / `SUNION` / `ZRANGEBYSCORE` and re-checks anything the indexes
 * cannot answer against the fetched candidates, so every query is correct and
 * the index list is purely a performance knob. Writes are single-round-trip
 * compare-and-set scripts that carry their own index updates.
 *
 * No modules required (no RedisJSON, no RediSearch) — plain Redis 6.2+, or a
 * compatible server such as Valkey, Dragonfly or Upstash. Bring any client:
 * the backend needs one `sendCommand(args)` method.
 *
 * The full `@hushkey/service-core` surface is re-exported so consumers can use
 * a single import for the service, the filter grammar, schemas, and adapters.
 *
 * @module
 */
export { RedisService } from "./redis.service.class.ts";
export type { RedisServiceOptions } from "./redis.service.class.ts";
export { RedisBackend } from "./redis.backend.ts";
export type { RedisBackendOptions, RedisClientLike } from "./redis.backend.ts";
export { indexMap, isIndexableValue, makeKeys, planFilter } from "./query.planner.ts";
export type {
  IndexKind,
  PlanSource,
  QueryPlan,
  RedisIndexSpec,
  RedisKeys,
} from "./query.planner.ts";
export {
  compareValues,
  getPath,
  hasPath,
  isOperatorCondition,
  matchesFilter,
  sortDocuments,
} from "./filter.matcher.ts";
export type { CompareOptions } from "./filter.matcher.ts";
export * from "@hushkey/service-core";
