import type { ClientSession, Collection, Db } from "mongodb";
import {
  DocumentService,
  type DocumentServiceOptions,
  type DocumentShape,
  type Filter,
  type IndexSpec,
  type SchemaLike,
} from "@hushkey/service-core";
import { MongoBackend } from "./mongo.backend.ts";

/**
 * Configuration for a {@link MongoService}: the core service options plus the
 * Mongo storage options handled by the backend.
 */
export interface MongoServiceOptions extends DocumentServiceOptions {
  /** Fields stored as numeric strings to coerce back to numbers on read. */
  numberCoerceColumns?: string[];
  /** Fields to back with a unique index (created at construction). */
  uniqueFields?: string[];
  /** Additional indexes to ensure at construction. */
  indexes?: IndexSpec[];
}

/**
 * Mongo's `Filter` re-skinned, superseded by the neutral grammar.
 *
 * @deprecated Use `Filter<T>` from `@hushkey/service-core` — the neutral
 * grammar SQL backends can compile. Operators outside it ($regex, $elemMatch,
 * …) belong behind the `.mongo()` escape hatch.
 */
export type PublicFilter<T> = Filter<T>;

/**
 * MongoDB-backed document-store service for a single collection.
 *
 * A thin composition: the entire service contract — string ids, the
 * audit/soft-delete meta envelope, soft delete by default, optimistic
 * locking, versioned cache invalidation, timeouts, telemetry — lives in the
 * core `DocumentService`; this class wires in the {@link MongoBackend} and
 * adds the two Mongo-only capabilities: `transaction()` (ClientSession) and
 * the `mongo()` escape hatch.
 *
 * @typeParam T The stored document shape (the schema's parsed type).
 */
export class MongoService<T extends DocumentShape> extends DocumentService<T> {
  readonly #mongoBackend: MongoBackend<T>;

  /**
   * Create a service over one MongoDB collection.
   *
   * @param db The connected MongoDB database.
   * @param schema Structural validator for the full document (zod object
   *   schemas satisfy this).
   * @param options Core service options plus Mongo storage options.
   */
  constructor(
    protected db: Db,
    schema: SchemaLike<T>,
    options: MongoServiceOptions,
  ) {
    const backend = new MongoBackend<T>(db, options);
    super(backend, schema, options);
    this.#mongoBackend = backend;
  }

  /**
   * Execute multiple operations atomically using a MongoDB ClientSession.
   * Requires a replica set or Atlas (transactions not supported on standalone).
   *
   * WARNING: `withTransaction` retries the callback on transient errors
   * (TransientTransactionError / UnknownTransactionCommitResult), so the
   * callback may run more than once. Keep side effects outside the callback
   * or make them idempotent.
   *
   * @example
   * ```ts
   * await userService.transaction(async (session) => {
   *   await userService.patch('id1', { credits: 100 }, { executionerId: 'system', session });
   *   await userService.patch('id2', { credits: -100 }, { executionerId: 'system', session });
   * });
   * ```
   *
   * @param callback Receives the session; pass it to every operation inside.
   * @returns The callback's return value.
   */
  async transaction<R>(
    callback: (session: ClientSession) => Promise<R>,
  ): Promise<R> {
    this.log({
      operation: "TRANSACTION_START",
      collection: this.options.collectionName,
    });
    const start = Date.now();

    const session = this.db.client.startSession();
    try {
      let result: R;
      await session.withTransaction(async () => {
        result = await callback(session);
      });
      this.log({
        operation: "TRANSACTION_SUCCESS",
        collection: this.options.collectionName,
        duration: Date.now() - start,
      });
      await this.invalidateCache();
      return result!;
    } catch (error) {
      this.log({
        operation: "TRANSACTION_ERROR",
        collection: this.options.collectionName,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Escape hatch: the raw MongoDB `Collection`. Call sites using this are
   * permanently backend-specific and bypass the service contract (caching,
   * soft delete, id normalization, validation).
   *
   * @returns The underlying driver collection.
   */
  mongo(): Collection {
    return this.#mongoBackend.collection;
  }
}
