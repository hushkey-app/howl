// deno-lint-ignore-file no-explicit-any
import type { Meta } from "../meta/meta.schema.ts";
import type { CacheAdapter, CacheOptions } from "../cache/cache.interface.ts";
import { InMemoryLRUCache } from "../cache/in-memory-cache.adapter.ts";
import type { TelemetryAdapter, TelemetryOptions } from "../telemetry/telemetry.interface.ts";
import type { SchemaError, SchemaLike } from "../schema/schema.interface.ts";
import type { Filter } from "../filter/filter.ts";
import type { SchemaAdmin, StorageBackend } from "../backend/backend.interface.ts";

/**
 * Minimal structural constraint on stored document shapes: every document has
 * a string `id`. The full envelope (`version`, `meta`) is enforced at runtime
 * by the schema, not the type system.
 */
export interface DocumentShape {
  /** The document's unique string id. */
  id: string;
}

/**
 * Fields accepted by `create()`: the document minus the envelope the service
 * stamps itself (`id`, `meta`, `version`).
 */
export type CreateArgs<T> = Omit<Partial<T>, "id" | "meta" | "version">;

/**
 * The shape the service returns: the validated public document. Storage
 * internals (Mongo `_id`, SQL row ids) never appear; `id` is always a string.
 */
export type PublicDocument<T> = T;

/** Index specification: keys with direction, plus backend index options. */
export interface IndexSpec {
  /** Indexed fields: field (or dot-path) → 1 ascending, -1 descending. */
  keys: Record<string, 1 | -1>;
  /** Index options (unique, sparse, name). */
  options?: { unique?: boolean; sparse?: boolean; name?: string };
}

/** Configuration for a {@link DocumentService}. */
export interface DocumentServiceOptions {
  /** The collection name — cache-key segment and telemetry label. */
  collectionName: string;
  /** Log every operation via `console.debug` (default false). */
  debug?: boolean;
  /** Per-operation timeout in milliseconds (default 30s). */
  queryTimeout?: number;
  /** Query-result caching configuration (default disabled). */
  cache?: CacheOptions;
  /** Telemetry configuration (default disabled). */
  otel?: TelemetryOptions;
}

/** A structured debug-log entry emitted by the service when `debug` is on. */
export interface LogEntry {
  /** Operation tag, e.g. `GET_CACHE_HIT`, `PATCH`, `CACHE_INVALIDATE`. */
  operation: string;
  /** The collection the operation ran against. */
  collection: string;
  /** Operation duration in milliseconds, when measured. */
  duration?: number;
  /** Operation-specific structured details. */
  data?: Record<string, unknown>;
  /** Error message, for failure entries. */
  error?: string;
}

const DEFAULT_QUERY_TIMEOUT = 30_000;

/**
 * Backend-independent document-store service for a single collection.
 *
 * Owns the entire hushkey service contract — write-boundary validation, the
 * audit/soft-delete {@link Meta} envelope, soft delete by default, optimistic
 * locking via `version`, versioned cache invalidation (including the
 * read-your-writes old-key eviction), operation timeouts, and telemetry. A
 * {@link StorageBackend} supplies only collection-level storage operations;
 * `@hushkey/mongo-service` is the first backend.
 *
 * @typeParam T The stored document shape (the schema's parsed type).
 */
export class DocumentService<T extends DocumentShape> {
  /** Whether debug logging is enabled. */
  protected readonly debug: boolean;
  /** Per-operation timeout in milliseconds. */
  protected readonly queryTimeout: number;

  /** Whether query-result caching is enabled. */
  protected readonly cacheEnabled: boolean;
  /** The cache adapter, or null when caching is disabled. */
  protected readonly cacheAdapter: CacheAdapter | null;
  /** Cache TTL in seconds. */
  protected readonly cacheTtl: number;
  /** Whether `find()` results are cached. */
  protected readonly cacheFind: boolean;
  /** Whether `get()` results are cached. */
  protected readonly cacheGet: boolean;
  /** In-process collection version — fallback when the adapter owns none. */
  protected collectionVersion: number;

  /** Whether telemetry spans are emitted. */
  protected readonly telemetryEnabled: boolean;
  /** The telemetry adapter, or null when telemetry is disabled. */
  protected readonly telemetryAdapter: TelemetryAdapter | null;

  /**
   * Create a service over one collection.
   *
   * @param backend The storage backend for this collection.
   * @param schema Structural validator for the full document (zod object
   *   schemas satisfy this).
   * @param options Service configuration.
   */
  constructor(
    protected backend: StorageBackend<T>,
    protected schema: SchemaLike<T>,
    protected options: DocumentServiceOptions,
  ) {
    this.debug = options.debug ?? false;
    this.queryTimeout = options.queryTimeout ?? DEFAULT_QUERY_TIMEOUT;

    // Cache
    this.cacheEnabled = options.cache?.enabled ?? false;
    this.cacheTtl = options.cache?.ttl ?? 300;
    this.cacheFind = options.cache?.cacheFind ?? true;
    this.cacheGet = options.cache?.cacheGet ?? true;
    this.cacheAdapter = this.cacheEnabled
      ? (options.cache?.adapter ??
        new InMemoryLRUCache(options.cache?.maxSize ?? 1000))
      : null;
    this.collectionVersion = 0;

    // The backend's cachePrefix and a namespaced adapter's keyPrefix MUST
    // agree: keys are built with the former, the adapter's version key and
    // patternless clear() scope with the latter. A silent mismatch makes
    // clear() miss every entry — fail loud at construction instead.
    if (this.cacheAdapter && "keyPrefix" in this.cacheAdapter) {
      const adapterPrefix = (this.cacheAdapter as { keyPrefix?: unknown }).keyPrefix;
      if (typeof adapterPrefix === "string" && adapterPrefix !== backend.cachePrefix) {
        throw new Error(
          `[${options.collectionName}] cache adapter keyPrefix "${adapterPrefix}" does not match backend cachePrefix "${backend.cachePrefix}"`,
        );
      }
    }

    // Telemetry
    this.telemetryAdapter = options.otel?.adapter ?? null;
    this.telemetryEnabled = options.otel?.enabled ??
      (this.telemetryAdapter !== null);
  }

  /** The collection name this service operates on. */
  get collection(): string {
    return this.options.collectionName;
  }

  /** The storage backend's kind tag (`mongo`, `sql`, `sqlite`, …). */
  get backendKind(): string {
    return this.backend.cachePrefix;
  }

  /**
   * The backend's {@link SchemaAdmin} capability (promoted-column
   * introspection + orphan cleanup), or `null` when the backend does not
   * implement it (e.g. a document store with no column concept). Feature-
   * detected structurally so the core stays decoupled from any backend.
   */
  get schemaAdmin(): SchemaAdmin | null {
    const candidate = this.backend as unknown as Partial<SchemaAdmin>;
    return typeof candidate.listColumns === "function" &&
        typeof candidate.dropColumn === "function"
      ? (candidate as SchemaAdmin)
      : null;
  }

  // ============================================================
  // Logging
  // ============================================================

  /** Emit a structured debug-log entry when `debug` is enabled. */
  protected log(entry: LogEntry): void {
    if (this.debug) {
      console.debug("[DocumentService]", {
        timestamp: new Date().toISOString(),
        ...entry,
      });
    }
  }

  // ============================================================
  // Telemetry
  // ============================================================

  /** Start a telemetry span for an operation; null when telemetry is off. */
  protected startTelemetrySpan(
    operation: string,
    attributes?: Record<string, string | number | boolean>,
  ): any | null {
    if (!this.telemetryEnabled || !this.telemetryAdapter) return null;
    try {
      return this.telemetryAdapter.startSpan(
        operation,
        this.options.collectionName,
        attributes,
      );
    } catch {
      //@silent-catch decided=2026-05-21 reason=telemetry start failure must not block DB operation
      return null;
    }
  }

  /** Finalize a telemetry span; failures never reach the caller. */
  protected endTelemetrySpan(
    span: any | null,
    success: boolean,
    error?: Error | string,
    attributes?: Record<string, string | number | boolean>,
  ): void {
    if (!span || !this.telemetryAdapter) return;
    try {
      this.telemetryAdapter.endSpan(span, success, error, attributes);
    } catch {
      //@silent-catch decided=2026-05-21 reason=telemetry span close failure must not break service caller
    }
  }

  // ============================================================
  // Timeout
  // ============================================================

  /**
   * Race a backend operation against `queryTimeout`. The underlying operation
   * is NOT aborted on timeout, only abandoned.
   */
  protected async executeWithTimeout<R>(
    operation: string,
    promise: Promise<R>,
  ): Promise<R> {
    const start = Date.now();
    this.log({
      operation: `${operation}_START`,
      collection: this.options.collectionName,
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () =>
            reject(
              new Error(
                `[${this.options.collectionName}] [${operation}] Timeout after ${this.queryTimeout}ms`,
              ),
            ),
          this.queryTimeout,
        );
      });
      const result = await Promise.race([promise, timeout]);
      clearTimeout(timeoutId);
      this.log({
        operation: `${operation}_SUCCESS`,
        collection: this.options.collectionName,
        duration: Date.now() - start,
      });
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      this.log({
        operation: `${operation}_ERROR`,
        collection: this.options.collectionName,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ============================================================
  // Cache
  // ============================================================

  /**
   * Hash a find-cache identity object: two independent 32-bit hashes
   * (DJB2-XOR + FNV-1a) concatenated — a collision must hit both
   * simultaneously (~64-bit space). A find-cache collision serves the wrong
   * result set, so 32 bits alone is too thin. Do not shrink.
   */
  protected generateCacheHash(obj: any): string {
    const str = JSON.stringify(this.sortKeys(obj));
    let h1 = 5381;
    let h2 = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = (((h1 << 5) + h1) ^ c) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
    }
    return `${h1.toString(36)}${h2.toString(36)}`;
  }

  /** Recursively sort object keys so hash input is order-independent. */
  private sortKeys(value: any): any {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((v) => this.sortKeys(v));
    if (typeof value === "object") {
      const sorted: Record<string, any> = {};
      for (const key of Object.keys(value).sort()) {
        sorted[key] = this.sortKeys(value[key]);
      }
      return sorted;
    }
    return value;
  }

  /** Read the collection version from the adapter (or in-process fallback). */
  protected async getCacheVersion(): Promise<number> {
    if (this.cacheAdapter && "getVersion" in this.cacheAdapter) {
      return await (this.cacheAdapter as { getVersion(): Promise<number> })
        .getVersion();
    }
    return this.collectionVersion;
  }

  /**
   * Build a versioned cache key:
   * `<cachePrefix>:<collection>:v<version>:get:<id>` or
   * `…:find:<hash>`. The prefix is the backend's `cachePrefix`.
   */
  protected async generateCacheKey(
    operation: "get" | "find",
    identifier: string | Record<string, any>,
  ): Promise<string> {
    const version = await this.getCacheVersion();
    const prefix = `${this.backend.cachePrefix}:${this.options.collectionName}:v${version}`;
    if (operation === "get") return `${prefix}:get:${identifier}`;
    return `${prefix}:find:${this.generateCacheHash(identifier)}`;
  }

  /**
   * Bump the collection version, orphaning every key built under the old one.
   * Failures are swallowed and logged — see the inline policy note.
   */
  protected async invalidateCache(): Promise<void> {
    if (!this.cacheEnabled) return;
    // The version bump runs AFTER the document has already been persisted.
    // A cache-backend blip here must not surface as an error for a write that
    // happened — swallow + log. The cache may serve stale reads until the
    // TTL expires or the next successful bump, which is strictly better than
    // failing a committed write. (HANDOFF Known Issues #2.)
    try {
      if (this.cacheAdapter && "incrementVersion" in this.cacheAdapter) {
        const newVersion = await (this.cacheAdapter as { incrementVersion(): Promise<number> })
          .incrementVersion();
        this.log({
          operation: "CACHE_INVALIDATE",
          collection: this.options.collectionName,
          data: { version: newVersion },
        });
        return;
      }
      this.collectionVersion++;
      this.log({
        operation: "CACHE_INVALIDATE",
        collection: this.options.collectionName,
        data: { version: this.collectionVersion },
      });
    } catch (error) {
      this.log({
        operation: "CACHE_INVALIDATE_ERROR",
        collection: this.options.collectionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete the CURRENT-version `get:` key for an id — the read-your-writes
   * fix. Call BEFORE `invalidateCache()` bumps the version, so it targets the
   * pre-bump key. See the inline note for the full race.
   */
  // Delete the CURRENT-version `get:` key for an id. Call this BEFORE
  // invalidateCache() bumps the version, so it targets the pre-bump key.
  //
  // Without it, a lagging replica still inside its in-process version-cache
  // window (RedisCacheAdapter caches the version for ~1s) keeps building the
  // old-version key and serves the stale entry that is still in the shared
  // cache. The version bump alone orphans old keys but does NOT evict them —
  // so the stale doc is served for up to the cache TTL (users: 7 days).
  // Deleting the old key forces lagging replicas to miss → read the backend →
  // fresh. (HANDOFF Known Issues #1 — the prod read-your-writes race.)
  protected async invalidateGetKey(id: string): Promise<void> {
    if (!this.cacheEnabled || !this.cacheGet || !this.cacheAdapter) return;
    try {
      const oldKey = await this.generateCacheKey("get", id);
      await this.cacheAdapter.delete(oldKey);
    } catch (error) {
      this.log({
        operation: "CACHE_GET_KEY_INVALIDATE_ERROR",
        collection: this.options.collectionName,
        data: { id },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Expand dotted keys like { 'meta.updated_at': 1 } into nested { meta: { updated_at: 1 } }
   * Used before schema validation.
   */
  protected denestObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const parts = key.split(".");
      parts.reduce((acc, part, index) => {
        if (index === parts.length - 1) acc[part] = obj[key];
        else acc[part] = acc[part] || {};
        return acc[part];
      }, result);
    }
    return result;
  }

  /**
   * Flatten nested object to dot-notation for path-level update operations.
   * Avoids overwriting sibling keys inside nested documents. Arrays are
   * leaves (replaced whole); empty objects are dropped.
   */
  protected flattenObject(
    obj: Record<string, any>,
    parentKey = "",
    result: Record<string, any> = {},
  ): Record<string, any> {
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const newKey = parentKey ? `${parentKey}.${key}` : key;
      if (
        typeof obj[key] === "object" && obj[key] !== null &&
        !Array.isArray(obj[key])
      ) {
        this.flattenObject(obj[key], newKey, result);
      } else {
        result[newKey] = obj[key];
      }
    }
    return result;
  }

  /** Render a schema error's issues as one `path: message [code]` line. */
  protected formatValidationErrors(error: SchemaError): string {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        const code = issue.code ? ` [code: ${issue.code}]` : "";
        return `${path}: ${issue.message}${code}`;
      })
      .join("; ");
  }

  /**
   * Deep-merge patch args into an existing document. Nested objects merge,
   * arrays are replaced as-is, `undefined` source values are skipped, and
   * `null` clears the field (core contract).
   */
  protected deepMergePatch<D extends Record<string, any>>(
    target: D,
    source: Partial<D>,
  ): D {
    const result = { ...target };
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const sourceValue = source[key];
      const targetValue = target[key];
      if (sourceValue === undefined) continue;
      if (
        typeof sourceValue === "object" &&
        typeof targetValue === "object" &&
        !Array.isArray(sourceValue) &&
        !Array.isArray(targetValue) &&
        sourceValue !== null &&
        targetValue !== null
      ) {
        result[key] = this.deepMergePatch(targetValue, sourceValue) as any;
      } else {
        result[key] = sourceValue as any;
      }
    }
    return result;
  }

  // ============================================================
  // Soft-delete query filter
  // ============================================================

  /** Inject the active-documents condition (`meta.deleted_at: null`). */
  private withDeletedFilter(query: Filter<T>): Filter<T> {
    if (query.$and && Array.isArray(query.$and)) {
      return {
        ...query,
        $and: query.$and.map((condition: any) => ({
          ...condition,
          "meta.deleted_at": null,
        })),
      };
    }
    return { ...query, "meta.deleted_at": null };
  }

  // ============================================================
  // CREATE
  // ============================================================

  /**
   * Insert a new document. Stamps the meta envelope and `version: 1`,
   * validates the full document against the schema (unknown keys are
   * stripped), and bumps the cache version. Returns the created document with
   * its generated string `id` — no extra read round trip.
   *
   * @param args The document fields (no `id`/`meta`/`version`).
   * @param options `executionerId` for audit stamping; optional `session`.
   * @returns The created document.
   */
  async create(
    args: CreateArgs<T>,
    options: { executionerId?: string; session?: unknown } = {
      executionerId: "system",
    },
  ): Promise<PublicDocument<T>> {
    const span = this.startTelemetrySpan("CREATE", {
      executionerId: options.executionerId || "system",
    });

    try {
      if (!args) {
        throw new Error(
          `[${this.options.collectionName}] [CREATE] args is required`,
        );
      }

      this.log({
        operation: "CREATE",
        collection: this.options.collectionName,
      });

      const id = this.backend.generateId();
      const dataWithMeta = {
        ...(args as Record<string, unknown>),
        id,
        version: 1,
        meta: {
          created_at: Date.now(),
          created_by: options.executionerId ?? "system",
          updated_at: Date.now(),
          updated_by: options.executionerId ?? "system",
          deleted_at: null,
          deleted_by: null,
        } satisfies Meta,
      };

      const denested = this.denestObject(dataWithMeta);
      const parsed = await this.schema.safeParseAsync(denested);
      if (!parsed.success) {
        throw new Error(
          `[${this.options.collectionName}] [CREATE] Invalid data: ${
            this.formatValidationErrors(parsed.error)
          }`,
        );
      }

      await this.executeWithTimeout(
        "CREATE",
        this.backend.insertOne(parsed.data, { session: options.session }),
      );

      await this.invalidateCache();

      this.endTelemetrySpan(span, true, undefined, { "db.rows_affected": 1 });
      // parsed.data is the full validated document — return it directly
      // instead of re-reading by id (saves a round trip per create).
      return parsed.data;
    } catch (error) {
      this.endTelemetrySpan(
        span,
        false,
        error instanceof Error ? error : String(error),
      );
      throw error;
    }
  }

  // ============================================================
  // GET
  // ============================================================

  /**
   * Fetch a single document by its string `id`. Soft-deleted documents are
   * excluded unless `viewDeleted` is set. Served from cache when caching is
   * enabled and neither `viewDeleted` nor a `session` is active.
   *
   * @param id The document's string id.
   * @param options `viewDeleted` to include soft-deleted; optional `session`.
   * @returns The document, or null if not found.
   */
  async get(
    id: string,
    options: { viewDeleted?: boolean; session?: unknown } = {
      viewDeleted: false,
    },
  ): Promise<PublicDocument<T> | null> {
    const span = this.startTelemetrySpan("GET", {
      viewDeleted: options.viewDeleted || false,
    });
    const getStart = performance.now();

    try {
      if (!id) {
        throw new Error(
          `[${this.options.collectionName}] [GET] ID is required`,
        );
      }

      this.log({
        operation: "GET",
        collection: this.options.collectionName,
        data: { id },
      });

      const cacheable = this.cacheEnabled && this.cacheGet && this.cacheAdapter &&
        !options.viewDeleted && !options.session;
      let cacheKey: string | null = null;

      if (cacheable) {
        try {
          const tKey = performance.now();
          cacheKey = await this.generateCacheKey("get", id);
          const dKey = performance.now() - tKey;
          const tGet = performance.now();
          const cached = await this.cacheAdapter!.get<PublicDocument<T>>(
            cacheKey,
          );
          const dGet = performance.now() - tGet;
          if (cached !== null) {
            this.log({
              operation: "GET_CACHE_HIT",
              collection: this.options.collectionName,
              duration: Math.round((performance.now() - getStart) * 100) / 100,
              data: {
                key_ms: Math.round(dKey * 100) / 100,
                get_ms: Math.round(dGet * 100) / 100,
              },
            });
            this.endTelemetrySpan(span, true, undefined, {
              "db.rows_affected": 1,
              "cache.hit": true,
            });
            return cached;
          }
          this.log({
            operation: "GET_CACHE_MISS",
            collection: this.options.collectionName,
            duration: Math.round((performance.now() - getStart) * 100) / 100,
            data: {
              key_ms: Math.round(dKey * 100) / 100,
              get_ms: Math.round(dGet * 100) / 100,
            },
          });
        } catch (error) {
          this.log({
            operation: "GET_CACHE_ERROR",
            collection: this.options.collectionName,
            duration: Math.round((performance.now() - getStart) * 100) / 100,
            error: String(error),
          });
        }
      }

      const filter: Record<string, unknown> = { id };
      if (!options.viewDeleted) filter["meta.deleted_at"] = null;

      const item = await this.executeWithTimeout(
        "GET",
        this.backend.findOne(filter as Filter<T>, { session: options.session }),
      );
      if (!item) {
        this.endTelemetrySpan(span, true, undefined, { "db.rows_affected": 0 });
        return null;
      }

      if (cacheable && cacheKey) {
        try {
          await this.cacheAdapter!.set(cacheKey, item, this.cacheTtl);
        } catch (error) {
          this.log({
            operation: "GET_CACHE_SET_ERROR",
            collection: this.options.collectionName,
            error: String(error),
          });
        }
      }

      this.log({
        operation: "GET_DONE",
        collection: this.options.collectionName,
        duration: Math.round((performance.now() - getStart) * 100) / 100,
      });
      this.endTelemetrySpan(span, true, undefined, { "db.rows_affected": 1 });
      return item;
    } catch (error) {
      this.endTelemetrySpan(
        span,
        false,
        error instanceof Error ? error : String(error),
      );
      throw error;
    }
  }

  // ============================================================
  // MGET — batch get by id
  // ============================================================

  /**
   * Batch get by id. Reads the cache with a single `mget`, fetches the misses
   * from the backend in one query, and stitches results back into input order
   * with `null` for any id not found. Soft-deleted documents are excluded.
   *
   * @param ids The ids to fetch.
   * @returns Documents aligned to `ids`, `null` where missing.
   */
  async mget(ids: string[]): Promise<(PublicDocument<T> | null)[]> {
    if (ids.length === 0) return [];
    const start = performance.now();

    const cacheable = this.cacheEnabled && this.cacheGet && this.cacheAdapter &&
      typeof this.cacheAdapter.mget === "function";

    let cachedValues: (PublicDocument<T> | null)[];
    let cacheKeys: string[] = [];
    let dKeys = 0;
    let dMget = 0;
    let cacheReadOk = cacheable;
    if (cacheable) {
      // Key generation reads the cache version (a network round trip for
      // shared adapters), which can throw. Unlike get()/find() this whole
      // block was historically un-guarded, so a version-read blip failed the
      // entire mget instead of degrading to a DB read. Wrap it and fall
      // through on failure. (HANDOFF Known Issues #3.)
      try {
        const tKeys = performance.now();
        cacheKeys = await Promise.all(
          ids.map((id) => this.generateCacheKey("get", id)),
        );
        dKeys = performance.now() - tKeys;
        const tMget = performance.now();
        cachedValues = await this.cacheAdapter!.mget!<PublicDocument<T>>(cacheKeys);
        dMget = performance.now() - tMget;
      } catch (error) {
        cacheReadOk = false;
        cachedValues = ids.map(() => null);
        this.log({
          operation: "MGET_CACHE_ERROR",
          collection: this.options.collectionName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      cachedValues = ids.map(() => null);
    }

    const missingIndexes: number[] = [];
    const missingIds: string[] = [];
    cachedValues.forEach((v, i) => {
      if (v === null) {
        missingIndexes.push(i);
        missingIds.push(ids[i]);
      }
    });

    if (missingIds.length === 0) {
      this.log({
        operation: "MGET_CACHE_HIT_ALL",
        collection: this.options.collectionName,
        duration: Math.round((performance.now() - start) * 100) / 100,
        data: {
          count: ids.length,
          keys_ms: Math.round(dKeys * 100) / 100,
          mget_ms: Math.round(dMget * 100) / 100,
        },
      });
      return cachedValues;
    }

    // Fetch missing from the backend in one round trip
    const items = await this.executeWithTimeout(
      "MGET",
      this.backend.findMany(
        { id: { $in: missingIds }, "meta.deleted_at": null } as unknown as Filter<T>,
      ),
    );

    const fetched = new Map<string, PublicDocument<T>>();
    for (const item of items) {
      fetched.set(item.id, item);
    }

    // Cache the fetched docs (non-blocking; adapter handles its own errors).
    // Reuse the keys computed during the mget step — same id → same key.
    // Only when the cache read succeeded: a failed read leaves cacheKeys
    // empty/partial, so reusing them would map ids to undefined keys.
    if (cacheReadOk) {
      const idToKey = new Map<string, string>();
      for (let i = 0; i < missingIds.length; i++) {
        idToKey.set(missingIds[i], cacheKeys[missingIndexes[i]]);
      }
      Promise.all(
        Array.from(fetched.entries()).map(([id, doc]) => {
          const key = idToKey.get(id);
          if (!key) return;
          return this.cacheAdapter!.set(key, doc, this.cacheTtl);
        }),
      ).catch(() => {/* silent */});
    }

    // Stitch results back into the original order
    const result = [...cachedValues];
    for (let i = 0; i < missingIndexes.length; i++) {
      const idx = missingIndexes[i];
      result[idx] = fetched.get(missingIds[i]) ?? null;
    }

    this.log({
      operation: "MGET_DONE",
      collection: this.options.collectionName,
      duration: Math.round((performance.now() - start) * 100) / 100,
      data: {
        total: ids.length,
        hits: ids.length - missingIds.length,
        misses: missingIds.length,
      },
    });

    return result;
  }

  // ============================================================
  // FIND
  // ============================================================

  /**
   * Query documents with the neutral filter grammar. Soft-deleted documents
   * are excluded unless `viewDeleted`. Supports projection (`select`),
   * `limit`/`skip`, `sort`, and a backend read-routing hint. Result sets are
   * cached (and the first 50 docs prefetched into the get cache) when caching
   * is enabled and no `session` is active.
   *
   * @param args Query, projection, pagination, sort, read hint, session.
   * @returns The matching documents.
   */
  async find(
    args: {
      query?: Filter<T>;
      select?: (keyof T & string)[];
      limit?: number;
      skip?: number;
      sort?: { [key: string]: 1 | -1 };
      viewDeleted?: boolean;
      readPreference?: string;
      session?: unknown;
    } = {},
  ): Promise<PublicDocument<T>[]> {
    const span = this.startTelemetrySpan("FIND", {
      hasQuery: !!args.query,
      viewDeleted: args.viewDeleted || false,
    });
    const findStart = performance.now();

    try {
      this.log({
        operation: "FIND",
        collection: this.options.collectionName,
        data: {
          hasQuery: !!args.query,
          limit: args.limit,
          skip: args.skip,
          viewDeleted: args.viewDeleted,
        },
      });

      const rawQuery = (args.query ?? {}) as Filter<T>;
      const query = args.viewDeleted ? rawQuery : this.withDeletedFilter(rawQuery);

      // Cache check — skip when session is active (inside a transaction)
      const cacheable = this.cacheEnabled && this.cacheFind &&
        this.cacheAdapter && !args.viewDeleted && !args.session;
      let cacheKey: string | null = null;

      if (cacheable) {
        try {
          const tKey = performance.now();
          cacheKey = await this.generateCacheKey("find", {
            query,
            limit: args.limit,
            skip: args.skip,
            sort: args.sort,
            select: args.select,
          });
          const dKey = performance.now() - tKey;
          const tGet = performance.now();
          const cached = await this.cacheAdapter!.get<PublicDocument<T>[]>(
            cacheKey,
          );
          const dGet = performance.now() - tGet;
          if (cached !== null) {
            this.log({
              operation: "FIND_CACHE_HIT",
              collection: this.options.collectionName,
              duration: Math.round((performance.now() - findStart) * 100) / 100,
              data: {
                key_ms: Math.round(dKey * 100) / 100,
                get_ms: Math.round(dGet * 100) / 100,
              },
            });
            this.endTelemetrySpan(span, true, undefined, {
              "db.rows_affected": cached.length,
              "cache.hit": true,
            });
            return cached;
          }
          this.log({
            operation: "FIND_CACHE_MISS",
            collection: this.options.collectionName,
            duration: Math.round((performance.now() - findStart) * 100) / 100,
          });
        } catch (error) {
          this.log({
            operation: "FIND_CACHE_ERROR",
            collection: this.options.collectionName,
            duration: Math.round((performance.now() - findStart) * 100) / 100,
            error: String(error),
          });
        }
      }

      const items = await this.executeWithTimeout(
        "FIND",
        this.backend.findMany(query, {
          limit: args.limit,
          skip: args.skip,
          sort: args.sort,
          select: args.select as string[] | undefined,
          readPreference: args.readPreference,
          session: args.session,
        }),
      );

      if (cacheable && cacheKey) {
        try {
          await this.cacheAdapter!.set(cacheKey, items, this.cacheTtl);

          // Prefetch individual items into get cache (non-blocking)
          if (this.cacheGet && items.length > 0) {
            const PREFETCH_LIMIT = 50;
            const PREFETCH_CONCURRENCY = 20;
            const toPrefetch = items.slice(0, PREFETCH_LIMIT);

            (async () => {
              for (
                let i = 0;
                i < toPrefetch.length;
                i += PREFETCH_CONCURRENCY
              ) {
                await Promise.all(
                  toPrefetch.slice(i, i + PREFETCH_CONCURRENCY).map(
                    async (item) => {
                      try {
                        const itemId = item.id;
                        if (itemId && this.cacheAdapter) {
                          const key = await this.generateCacheKey(
                            "get",
                            itemId,
                          );
                          await this.cacheAdapter.set(key, item, this.cacheTtl);
                        }
                      } catch {
                        //@silent-catch decided=2026-05-21 reason=fire-and-forget prefetch cache set; next read repopulates
                      }
                    },
                  ),
                ).catch(() => {
                  //@silent-catch decided=2026-05-21 reason=prefetch Promise.all rejection; non-blocking find() side-effect
                });
              }
            })().catch(() => {
              //@silent-catch decided=2026-05-21 reason=prefetch IIFE rejection; non-blocking find() side-effect
            });
          }
        } catch (error) {
          this.log({
            operation: "FIND_CACHE_SET_ERROR",
            collection: this.options.collectionName,
            error: String(error),
          });
        }
      }

      this.log({
        operation: "FIND_DONE",
        collection: this.options.collectionName,
        duration: Math.round((performance.now() - findStart) * 100) / 100,
        data: { count: items.length },
      });
      this.endTelemetrySpan(span, true, undefined, {
        "db.rows_affected": items.length,
      });
      return items;
    } catch (error) {
      this.endTelemetrySpan(
        span,
        false,
        error instanceof Error ? error : String(error),
      );
      throw error;
    }
  }

  // ============================================================
  // COUNT
  // ============================================================

  /**
   * Count documents matching a query. Soft-deleted documents are excluded
   * unless `viewDeleted` is set. Not cached.
   *
   * @param args Query, `viewDeleted`, optional `session`.
   * @returns The match count.
   */
  async count(
    args: {
      query?: Filter<T>;
      viewDeleted?: boolean;
      session?: unknown;
    } = {},
  ): Promise<number> {
    const span = this.startTelemetrySpan("COUNT", {
      viewDeleted: args.viewDeleted || false,
    });

    try {
      this.log({ operation: "COUNT", collection: this.options.collectionName });

      const rawQuery = (args.query ?? {}) as Filter<T>;
      const query = args.viewDeleted ? rawQuery : this.withDeletedFilter(rawQuery);

      const count = await this.executeWithTimeout(
        "COUNT",
        this.backend.count(query, { session: args.session }),
      );

      this.endTelemetrySpan(span, true, undefined, {
        "db.rows_affected": count,
      });
      return count;
    } catch (error) {
      this.endTelemetrySpan(
        span,
        false,
        error instanceof Error ? error : String(error),
      );
      throw error;
    }
  }

  // ============================================================
  // PATCH
  // ============================================================

  /**
   * Partially update a document. Deep-merges `args` into the existing document
   * (objects merge, arrays replace, `null` clears), validates the full merged
   * document, then writes only the patched paths (plus meta audit fields) so
   * concurrent writes to unrelated fields are not reverted. `version` is
   * incremented atomically; pass `version` in `args` to enforce optimistic
   * locking.
   *
   * @param id The document's string id.
   * @param args Fields to patch; an optional `version` acts as a lock filter.
   * @param options `executionerId`, `allowDeleted` (patch a soft-deleted doc),
   *   optional `session`.
   * @returns The updated document, or `undefined` if no document matched.
   */
  async patch(
    id: string,
    args: Partial<Omit<T, "id" | "meta" | "version">>,
    options: {
      executionerId?: string;
      allowDeleted?: boolean;
      session?: unknown;
    } = { executionerId: "system" },
  ): Promise<PublicDocument<T> | undefined> {
    const span = this.startTelemetrySpan("PATCH", {
      executionerId: options.executionerId || "system",
      allowDeleted: options.allowDeleted || false,
    });

    try {
      if (!id) {
        throw new Error(
          `[${this.options.collectionName}] [PATCH] ID is required`,
        );
      }
      if (!args || typeof args !== "object") {
        throw new Error(
          `[${this.options.collectionName}] [PATCH] args must be an object`,
        );
      }

      this.log({
        operation: "PATCH",
        collection: this.options.collectionName,
        data: { id },
      });

      const existing = await this.get(id, {
        viewDeleted: options.allowDeleted,
        session: options.session,
      });
      if (!existing) return undefined;

      const existingMeta = (existing as any).meta as Meta;
      if (
        !options.allowDeleted && existingMeta?.deleted_at !== null &&
        existingMeta?.deleted_at !== undefined
      ) {
        throw new Error(
          `[${this.options.collectionName}] [PATCH] Cannot patch a deleted item. Use allowDeleted: true to restore it.`,
        );
      }

      // Extract expected version for optimistic locking
      const expectedVersion = ("version" in args && (args as any).version !== undefined)
        ? (args as any).version as number
        : undefined;

      const argsWithoutVersion = { ...args } as any;
      delete argsWithoutVersion.version;

      // Deep merge
      const merged = this.deepMergePatch(existing as any, argsWithoutVersion);
      const dataWithMeta = {
        ...merged,
        meta: {
          ...existingMeta,
          updated_at: Date.now(),
          updated_by: options.executionerId ?? "system",
        },
      };

      const denested = this.denestObject(dataWithMeta);
      if (!denested.id) denested.id = id;
      const parsed = await this.schema.safeParseAsync(denested);
      if (!parsed.success) {
        throw new Error(
          `[${this.options.collectionName}] [PATCH] Invalid data: ${
            this.formatValidationErrors(parsed.error)
          }`,
        );
      }

      // Write only the paths the caller actually patched (plus meta audit
      // fields) — never the whole merged document. Writing the full doc
      // re-asserts every field from this call's read, so a concurrent patch
      // to an unrelated field would be silently reverted by stale data
      // (lost update). Values are taken from the validated merged doc so
      // schema defaults/transforms inside patched subtrees still apply.
      const flatAll = this.flattenObject(parsed.data as any);
      const patchPaths = Object.keys(
        this.flattenObject(this.denestObject(argsWithoutVersion)),
      );
      const flatData: Record<string, any> = {};
      for (const [key, val] of Object.entries(flatAll)) {
        if (key === "id" || key === "version") continue; // version incremented atomically below
        const patched = patchPaths.some((p) =>
          key === p || key.startsWith(`${p}.`) || p.startsWith(`${key}.`)
        );
        if (patched) flatData[key] = val;
      }
      flatData["meta.updated_at"] = dataWithMeta.meta.updated_at;
      flatData["meta.updated_by"] = dataWithMeta.meta.updated_by;

      const updated = await this.executeWithTimeout(
        "PATCH",
        this.backend.updatePaths(id, flatData, {
          expectedVersion,
          bumpVersion: true,
          session: options.session,
        }),
      );

      if (!updated) {
        if (expectedVersion !== undefined) {
          const currentVersion = (existing as any).version ?? 0;
          throw new Error(
            `[${this.options.collectionName}] [PATCH] Optimistic locking failed: expected version ${expectedVersion}, current is ${currentVersion}`,
          );
        }
        throw new Error(
          `[${this.options.collectionName}] [PATCH] Failed to update document`,
        );
      }

      // Evict the pre-bump get key before bumping (read-your-writes fix).
      await this.invalidateGetKey(id);
      await this.invalidateCache();

      // Re-cache the updated item — but never from inside a transaction:
      // pre-commit data cached under the new version key would outlive a
      // rollback and serve stale for the full TTL.
      if (this.cacheEnabled && this.cacheGet && this.cacheAdapter && !options.session) {
        try {
          const key = await this.generateCacheKey("get", id);
          await this.cacheAdapter.set(key, updated, this.cacheTtl);
        } catch {
          //@silent-catch decided=2026-05-21 reason=post-patch cache hydration; next read repopulates on miss
        }
      }

      this.endTelemetrySpan(span, true, undefined, { "db.rows_affected": 1 });
      return updated;
    } catch (error) {
      this.endTelemetrySpan(
        span,
        false,
        error instanceof Error ? error : String(error),
      );
      throw error;
    }
  }

  // ============================================================
  // DELETE
  // ============================================================

  /**
   * Delete a document. Soft by default (stamps `meta.deleted_at`/`deleted_by`);
   * pass `hard: true` for a real delete. The returned `item` is the public
   * document like any read path.
   *
   * @param id The document's string id.
   * @param options `hard` for a real delete, `executionerId`, optional `session`.
   * @returns `{ success, item, hard }`, or `undefined` if the document is absent.
   */
  async delete(
    id: string,
    options: {
      hard?: boolean;
      executionerId?: string;
      session?: unknown;
    } = { hard: false, executionerId: "system" },
  ): Promise<
    | { success: boolean; item: PublicDocument<T> | null; hard: boolean }
    | undefined
  > {
    const span = this.startTelemetrySpan("DELETE", {
      hard: options.hard || false,
      executionerId: options.executionerId || "system",
    });

    try {
      if (!id) {
        throw new Error(
          `[${this.options.collectionName}] [DELETE] ID is required`,
        );
      }

      this.log({
        operation: "DELETE",
        collection: this.options.collectionName,
        data: { id, hard: options.hard },
      });

      const existing = await this.get(id, { session: options.session });
      if (!existing) return undefined;

      let deletedItem: PublicDocument<T> | null;

      if (options.hard) {
        deletedItem = await this.executeWithTimeout(
          "DELETE_HARD",
          this.backend.deleteOne(id, { session: options.session }),
        );
      } else {
        const flatData = this.flattenObject({
          meta: {
            ...(existing as any).meta,
            deleted_at: Date.now(),
            deleted_by: options.executionerId ?? "system",
          },
        });

        deletedItem = await this.executeWithTimeout(
          "DELETE_SOFT",
          this.backend.updatePaths(id, flatData, {
            bumpVersion: false,
            session: options.session,
          }),
        );
      }

      // Evict the pre-bump get key before bumping (read-your-writes fix).
      await this.invalidateGetKey(id);
      await this.invalidateCache();

      this.endTelemetrySpan(span, true, undefined, {
        "db.rows_affected": deletedItem ? 1 : 0,
        hard: options.hard || false,
      });
      return { success: true, item: deletedItem, hard: options.hard ?? false };
    } catch (error) {
      this.endTelemetrySpan(
        span,
        false,
        error instanceof Error ? error : String(error),
      );
      throw error;
    }
  }

  // ============================================================
  // RESTORE
  // ============================================================

  /**
   * Un-delete a soft-deleted document (clears `meta.deleted_at`/`deleted_by`
   * and increments `version`). Returns the document unchanged if it is
   * already active.
   *
   * @param id The document's string id.
   * @param options `executionerId` for audit stamping; optional `session`.
   * @returns The restored document, or `undefined` if not found.
   */
  async restore(
    id: string,
    options: { executionerId?: string; session?: unknown } = {
      executionerId: "system",
    },
  ): Promise<PublicDocument<T> | undefined> {
    const span = this.startTelemetrySpan("RESTORE", {
      executionerId: options.executionerId || "system",
    });

    try {
      if (!id) {
        throw new Error(
          `[${this.options.collectionName}] [RESTORE] ID is required`,
        );
      }

      this.log({
        operation: "RESTORE",
        collection: this.options.collectionName,
        data: { id },
      });

      const existing = await this.get(id, {
        viewDeleted: true,
        session: options.session,
      });
      if (!existing) return undefined;

      const existingMeta = (existing as any).meta as Meta;
      // Already active — return as-is
      if (
        existingMeta?.deleted_at === null ||
        existingMeta?.deleted_at === undefined
      ) {
        return existing;
      }

      const flatData = this.flattenObject({
        meta: {
          ...existingMeta,
          deleted_at: null,
          deleted_by: null,
          updated_at: Date.now(),
          updated_by: options.executionerId ?? "system",
        },
      });

      const restored = await this.executeWithTimeout(
        "RESTORE",
        this.backend.updatePaths(id, flatData, {
          bumpVersion: true,
          session: options.session,
        }),
      );

      if (!restored) return undefined;

      // Evict the pre-bump get key before bumping (read-your-writes fix).
      await this.invalidateGetKey(id);
      await this.invalidateCache();

      this.endTelemetrySpan(span, true, undefined, { "db.rows_affected": 1 });
      return restored;
    } catch (error) {
      this.endTelemetrySpan(
        span,
        false,
        error instanceof Error ? error : String(error),
      );
      throw error;
    }
  }
}
