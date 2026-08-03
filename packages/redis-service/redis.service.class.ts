import {
  DocumentService,
  type DocumentServiceOptions,
  type DocumentShape,
  type SchemaLike,
} from "@hushkey/service-core";
import { RedisBackend, type RedisBackendOptions, type RedisClientLike } from "./redis.backend.ts";

/**
 * Configuration for a {@link RedisService}: the core service options plus the
 * Redis storage options handled by the backend.
 */
export interface RedisServiceOptions
  extends DocumentServiceOptions, Omit<RedisBackendOptions, "collectionName"> {}

/**
 * Redis-backed document-store service for a single collection — Redis as the
 * primary database, not a cache in front of one.
 *
 * A thin composition: the whole service contract (string ids, the
 * audit/soft-delete meta envelope, optimistic locking, timeouts, telemetry)
 * lives in the core `DocumentService`; this class wires in the
 * {@link RedisBackend} and adds the `.redis()` escape hatch.
 *
 * **Leave the service cache off.** Every read here is already a memory read
 * over one hop; putting a cache in front of Redis buys nothing and adds an
 * invalidation surface. Caching stays off unless `cache.enabled` is set, and
 * the contract is identical either way — a service written against Redis moves
 * to `@hushkey/pg-service` or `@hushkey/mongo-service` unchanged.
 *
 * @typeParam T The stored document shape (the schema's parsed type).
 */
export class RedisService<T extends DocumentShape> extends DocumentService<T> {
  readonly #redisBackend: RedisBackend<T>;

  /**
   * Create a service over one Redis key namespace.
   *
   * @param client The duck-typed Redis client (`{ sendCommand(args) }` — one
   *   line over ioredis, node-redis or `@db/redis`).
   * @param schema Structural validator for the full document (zod object
   *   schemas satisfy this).
   * @param options Core service options plus Redis storage options.
   */
  constructor(
    client: RedisClientLike,
    schema: SchemaLike<T>,
    options: RedisServiceOptions,
  ) {
    const backend = new RedisBackend<T>(client, options);
    super(backend, schema, options);
    this.#redisBackend = backend;
  }

  /**
   * Escape hatch: the underlying client for raw commands. Call sites using it
   * are permanently backend-specific and bypass the service contract
   * (validation, soft delete, index maintenance).
   *
   * @returns The duck-typed client the service was constructed with.
   */
  redis(): RedisClientLike {
    return this.#redisBackend.redis;
  }
}
