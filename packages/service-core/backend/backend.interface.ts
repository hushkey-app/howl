/**
 * The storage backend contract. Everything interesting — validation, locking,
 * audit stamping, soft-delete semantics, cache-version orchestration,
 * timeouts, telemetry — lives in the core `DocumentService`; a backend only
 * supplies these collection-level operations over the neutral filter grammar.
 *
 * Backends receive documents in their public shape (string `id`, no storage
 * internals) and must return them the same way — `_id`/row internals never
 * cross this boundary.
 *
 * @module
 */
import type { Filter } from "../filter/filter.ts";

/** Options common to every backend operation. */
export interface BackendOpOptions {
  /**
   * Opaque backend transaction/session handle (e.g. a Mongo `ClientSession`).
   * Core threads it through; only the backend interprets it.
   */
  session?: unknown;
}

/** Options for {@link StorageBackend.findMany}. */
export interface FindManyOptions extends BackendOpOptions {
  /** Maximum number of documents to return. */
  limit?: number;
  /** Number of matching documents to skip. */
  skip?: number;
  /** Sort specification: field (or dot-path) → 1 ascending, -1 descending. */
  sort?: Record<string, 1 | -1>;
  /** Projection: return only these fields (plus `id`). */
  select?: string[];
  /** Backend-specific read routing hint (e.g. Mongo read preference). */
  readPreference?: string;
}

/** Options for {@link StorageBackend.updatePaths}. */
export interface UpdatePathsOptions extends BackendOpOptions {
  /**
   * Optimistic lock: only update when the stored `version` equals this value.
   * A mismatch returns null (no document updated).
   */
  expectedVersion?: number;
  /**
   * Whether to atomically increment `version` with this update. Defaults to
   * true (patch/restore); soft delete passes false — deletes do not bump the
   * document version.
   */
  bumpVersion?: boolean;
}

/**
 * Collection-level storage operations a backend must implement. One instance
 * per collection. All documents in and out are public-shaped: string `id`,
 * the meta envelope, no storage-internal key.
 */
export interface StorageBackend<T> {
  /**
   * Cache-key namespace this backend writes under (`mongo`, `sql`, …). Core
   * builds every cache key with it and verifies at construction that a
   * version-owning cache adapter is configured with the same prefix.
   */
  readonly cachePrefix: string;

  /** Generate a new unique document id (string form). */
  generateId(): string;

  /** Insert one document. The document already carries its generated `id`. */
  insertOne(doc: T, options?: BackendOpOptions): Promise<void>;

  /** Find the first document matching the filter, or null. */
  findOne(filter: Filter<T>, options?: BackendOpOptions): Promise<T | null>;

  /** Find every document matching the filter, honoring the options. */
  findMany(filter: Filter<T>, options?: FindManyOptions): Promise<T[]>;

  /** Count documents matching the filter. */
  count(filter: Filter<T>, options?: BackendOpOptions): Promise<number>;

  /**
   * Apply dotted-path updates to one document by id, atomically with the
   * optional version bump/lock. Returns the post-update document, or null
   * when no document matched (absent id or failed `expectedVersion`).
   */
  updatePaths(
    id: string,
    paths: Record<string, unknown>,
    options?: UpdatePathsOptions,
  ): Promise<T | null>;

  /** Hard-delete one document by id. Returns the deleted document, or null. */
  deleteOne(id: string, options?: BackendOpOptions): Promise<T | null>;
}

/**
 * One promoted column (or index) physically present in the backend's storage,
 * as reported by {@link SchemaAdmin.listColumns}.
 */
export interface SchemaColumn {
  /** The physical column (or index) name. */
  column: string;
  /** The storage type, when the backend has one (`text`, `bigint`, …). */
  type: string;
  /**
   * Whether this column is still declared in the live backend config. `false`
   * means it is an **orphan** — physically present from an earlier `promote`
   * entry that has since been removed, no longer routed to by the filter
   * compiler, but still maintained (and indexed) on every write. Orphans are
   * the only columns {@link SchemaAdmin.dropColumn} will remove.
   */
  declared: boolean;
}

/**
 * Optional backend capability for **schema introspection and orphan cleanup**.
 *
 * The promoted-column DDL backends apply is purely additive (`ADD COLUMN IF
 * NOT EXISTS`): removing a path from `promote` stops routing queries to its
 * column but never drops the physical column or its index, leaving an orphan
 * that costs write/index maintenance for no read benefit. This capability lets
 * an operator surface those orphans and drop them — the one schema operation
 * that lives below the service contract (no validation, no version bump).
 *
 * Backends advertise support by implementing both methods; `DocumentService`
 * feature-detects via its `schemaAdmin` getter (returns `null` when absent, as
 * for document stores with no column concept). Authoring new promoted columns
 * stays in code — the declarative config is the source of truth — so this
 * surface is intentionally introspect-and-cleanup only.
 */
export interface SchemaAdmin {
  /**
   * List the promoted columns physically present in storage, each flagged
   * `declared` (in the live config) or not (an orphan).
   */
  listColumns(): Promise<SchemaColumn[]>;

  /**
   * Drop an **orphan** promoted column and its index. Throws when the column
   * is still declared in the live config (drop it from `promote` first) or is
   * absent.
   *
   * By default document data is untouched — only the generated column/index go,
   * the JSON `doc` keeps the key. Pass `purgeData` to also remove the matching
   * top-level JSON key from every document (used by the studio's rename/migrate
   * flow, which has already copied the data to its new field). `purgeData`
   * removes the **top-level** key equal to the column name; nested-derived
   * columns keep their JSON and need manual cleanup.
   *
   * @param column The physical column name to drop.
   * @param options `purgeData` to also strip the top-level JSON key.
   */
  dropColumn(column: string, options?: { purgeData?: boolean }): Promise<void>;
}
