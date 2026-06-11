import {
  DocumentService,
  type DocumentServiceOptions,
  type DocumentShape,
  type SchemaLike,
} from "@hushkey/service-core";
import { PgBackend, type PgBackendOptions, type PgClientLike } from "./pg.backend.ts";

/**
 * Configuration for a {@link PgService}: the core service options plus the
 * Postgres storage options handled by the backend.
 */
export interface PgServiceOptions
  extends DocumentServiceOptions, Omit<PgBackendOptions, "collectionName"> {}

/**
 * Postgres-backed document-store service for a single collection (table).
 *
 * A thin composition: the entire service contract — string ids, the
 * audit/soft-delete meta envelope, soft delete by default, optimistic
 * locking, versioned cache invalidation, timeouts, telemetry — lives in the
 * core `DocumentService`; this class wires in the {@link PgBackend} (hybrid
 * JSONB + promoted generated columns) and adds the `.sql()` escape hatch.
 *
 * No `transaction()` in v1 — Postgres transactions need a dedicated
 * connection, which is a driver concern. Run `BEGIN`/`COMMIT` on a dedicated
 * client and pass it as `session` to each operation.
 *
 * @typeParam T The stored document shape (the schema's parsed type).
 */
export class PgService<T extends DocumentShape> extends DocumentService<T> {
  readonly #pgBackend: PgBackend<T>;

  /**
   * Create a service over one Postgres table.
   *
   * @param client The duck-typed Postgres client (`pg` Pool/Client, Neon, or
   *   a postgres.js `sql.unsafe` wrapper).
   * @param schema Structural validator for the full document (zod object
   *   schemas satisfy this).
   * @param options Core service options plus Postgres storage options.
   */
  constructor(
    client: PgClientLike,
    schema: SchemaLike<T>,
    options: PgServiceOptions,
  ) {
    const backend = new PgBackend<T>(client, options);
    super(backend, schema, options);
    this.#pgBackend = backend;
  }

  /**
   * Escape hatch: the underlying Postgres client for raw SQL. Call sites
   * using it are permanently backend-specific and bypass the service contract
   * (caching, soft delete, validation).
   *
   * @returns The duck-typed client the service was constructed with.
   */
  sql(): PgClientLike {
    return this.#pgBackend.sql;
  }
}
