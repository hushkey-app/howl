/**
 * `@hushkey/service-core` — the backend-independent contract for the hushkey
 * document-store service layer.
 *
 * Owns everything that is not storage-specific: the {@link DocumentService}
 * orchestrator (validation, optimistic locking, audit stamping, soft delete,
 * versioned cache invalidation, timeouts, telemetry), the neutral filter
 * grammar, the {@link StorageBackend} contract backends implement, the
 * audit/soft-delete {@link Meta} envelope and its schema, the structural
 * schema interface, and the cache/telemetry adapter interfaces with bundled
 * adapters (in-memory LRU, Redis, OpenTelemetry). `@hushkey/mongo-service` is
 * the first backend; pg/sqlite follow the same contract.
 *
 * Subpath exports keep each concern importable on its own: `./service`,
 * `./filter`, `./backend`, `./schema`, `./meta`, `./cache`, `./telemetry`,
 * `./adapters/redis`, `./adapters/otel`.
 *
 * @module
 */
export { DocumentService } from "./service/document.service.ts";
export type {
  CreateArgs,
  DocumentServiceOptions,
  DocumentShape,
  IndexSpec,
  LogEntry,
  PublicDocument,
} from "./service/document.service.ts";
export type { Condition, Filter, FilterOperators } from "./filter/filter.ts";
export type {
  BackendOpOptions,
  FindManyOptions,
  StorageBackend,
  UpdatePathsOptions,
} from "./backend/backend.interface.ts";
export type {
  SafeParseResult,
  SchemaError,
  SchemaIssue,
  SchemaLike,
} from "./schema/schema.interface.ts";
export type { Meta } from "./meta/meta.schema.ts";
export { documentSchema, metaSchema } from "./meta/meta.schema.ts";
export type { CacheAdapter, CacheOptions } from "./cache/cache.interface.ts";
export { InMemoryLRUCache } from "./cache/in-memory-cache.adapter.ts";
export type { TelemetryAdapter, TelemetryOptions } from "./telemetry/telemetry.interface.ts";
export { RedisCacheAdapter } from "./adapters/redis/redis-cache.adapter.ts";
export { OpenTelemetryAdapter } from "./adapters/otel/opentelemetry.adapter.ts";
