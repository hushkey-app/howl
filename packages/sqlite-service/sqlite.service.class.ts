import {
  DocumentService,
  type DocumentServiceOptions,
  type DocumentShape,
  type SchemaLike,
} from "@hushkey/service-core";
import { SqliteBackend, type SqliteBackendOptions, type SqliteDbLike } from "./sqlite.backend.ts";

/**
 * Configuration for a {@link SqliteService}: the core service options plus
 * the SQLite storage options handled by the backend.
 */
export interface SqliteServiceOptions
  extends DocumentServiceOptions, Omit<SqliteBackendOptions, "collectionName"> {}

/**
 * SQLite-backed document-store service for a single collection (table) —
 * the zero-infra rung of the storage ladder, built for Deno's native
 * `node:sqlite` (no dependencies, no WASM, works under `deno compile`).
 *
 * A thin composition: the entire service contract — string ids, the
 * audit/soft-delete meta envelope, soft delete by default, optimistic
 * locking, versioned cache invalidation, timeouts, telemetry — lives in the
 * core `DocumentService`; this class wires in the {@link SqliteBackend}
 * (JSON document + promoted virtual generated columns) and adds the
 * `.sqlite()` escape hatch.
 *
 * Caching is rarely worth enabling here — reads are local microseconds — but
 * the contract is identical, so a service written against SQLite moves to
 * `@hushkey/pg-service` or `@hushkey/mongo-service` unchanged.
 *
 * @typeParam T The stored document shape (the schema's parsed type).
 */
export class SqliteService<T extends DocumentShape> extends DocumentService<T> {
  readonly #sqliteBackend: SqliteBackend<T>;

  /**
   * Create a service over one SQLite table.
   *
   * @param db The duck-typed SQLite handle — `new DatabaseSync(path)` from
   *   `node:sqlite` (use `":memory:"` for ephemeral storage).
   * @param schema Structural validator for the full document (zod object
   *   schemas satisfy this).
   * @param options Core service options plus SQLite storage options.
   */
  constructor(
    db: SqliteDbLike,
    schema: SchemaLike<T>,
    options: SqliteServiceOptions,
  ) {
    const backend = new SqliteBackend<T>(db, options);
    super(backend, schema, options);
    this.#sqliteBackend = backend;
  }

  /**
   * Escape hatch: the underlying SQLite handle for raw SQL. Call sites using
   * it are permanently backend-specific and bypass the service contract
   * (caching, soft delete, validation).
   *
   * @returns The duck-typed handle the service was constructed with.
   */
  sqlite(): SqliteDbLike {
    return this.#sqliteBackend.sqlite;
  }
}
