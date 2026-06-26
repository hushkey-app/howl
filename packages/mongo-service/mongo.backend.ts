// deno-lint-ignore-file no-explicit-any
import { type ClientSession, type Collection, type Db, ObjectId } from "mongodb";
import type {
  BackendOpOptions,
  DocumentShape,
  Filter,
  FindManyOptions,
  IndexSpec,
  StorageBackend,
  UpdatePathsOptions,
} from "@hushkey/service-core";

/** Storage configuration for a {@link MongoBackend}. */
export interface MongoBackendOptions {
  /** The MongoDB collection name. */
  collectionName: string;
  /** Log index errors via `console.debug` (default false). */
  debug?: boolean;
  /** Fields stored as numeric strings to coerce back to numbers on read. */
  numberCoerceColumns?: string[];
  /** Fields to back with a unique index (created at construction). */
  uniqueFields?: string[];
  /** Additional indexes to ensure at construction. */
  indexes?: IndexSpec[];
}

/**
 * MongoDB implementation of the `@hushkey/service-core` storage contract.
 *
 * Owns everything Mongo-specific: `_id: ObjectId` ↔ string `id` mapping (the
 * driver type never crosses the boundary), neutral-filter `id` → `_id`
 * conversion, index management, and the collection operations. All contract
 * behavior — validation, locking, soft delete, caching — lives in the core
 * `DocumentService`.
 *
 * @typeParam T The public document shape.
 */
export class MongoBackend<T extends DocumentShape> implements StorageBackend<T> {
  /** Cache-key namespace for Mongo-backed services. */
  readonly cachePrefix = "mongo";

  /**
   * Create a backend over one MongoDB collection.
   *
   * @param db The connected MongoDB database.
   * @param options Collection name and storage options.
   */
  constructor(
    protected db: Db,
    protected options: MongoBackendOptions,
  ) {
    this.ensureUniqueFields(options.uniqueFields ?? []);
    this.ensureIndexes(options.indexes ?? []);
  }

  /**
   * The raw driver collection — the escape hatch surface. Call sites using it
   * are permanently backend-specific.
   */
  get collection(): Collection {
    return this.db.collection(this.options.collectionName);
  }

  /** Generate a new document id (a stringified `ObjectId`). */
  generateId(): string {
    return new ObjectId().toString();
  }

  // ============================================================
  // Indexes
  // ============================================================

  /**
   * Ensure a unique index per configured field. `_id` is always indexed by
   * MongoDB — no manual index needed for the primary key. Failures are caught
   * per field: the constructor fires this without awaiting, so a createIndex
   * rejection (e.g. existing duplicates) would otherwise be an unhandled
   * rejection that kills the Deno process at startup.
   */
  protected async ensureUniqueFields(uniqueFields: string[] = []): Promise<void> {
    for (const field of uniqueFields) {
      try {
        await this.collection.createIndex({ [field]: 1 }, { unique: true });
      } catch (error) {
        this.logIndexError({ field, unique: true }, error);
      }
    }
  }

  /** Ensure the configured secondary indexes (failures caught per index). */
  protected async ensureIndexes(indexes: IndexSpec[] = []): Promise<void> {
    for (const idx of indexes) {
      try {
        await this.collection.createIndex(idx.keys, idx.options ?? {});
      } catch (error) {
        this.logIndexError({ keys: idx.keys, options: idx.options }, error);
      }
    }
  }

  /** Log a swallowed index-creation failure when `debug` is on. */
  private logIndexError(data: Record<string, unknown>, error: unknown): void {
    if (!this.options.debug) return;
    console.debug("[MongoBackend]", {
      operation: "INDEX_ERROR",
      collection: this.options.collectionName,
      data,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // ============================================================
  // id ↔ _id mapping
  // ============================================================

  /** Parse a string id into an ObjectId; throws on invalid format. */
  private toObjectId(id: string): ObjectId {
    try {
      return new ObjectId(id);
    } catch {
      throw new Error(
        `[${this.options.collectionName}] Invalid id format: "${id}"`,
      );
    }
  }

  /** Strip `_id`, derive the string `id`; coerce numeric-string columns. */
  protected normalize(doc: any): T {
    const explicitCoerce = new Set([
      ...(this.options.numberCoerceColumns ?? []),
      "version",
    ]);
    const result: any = {};
    for (const [key, val] of Object.entries(doc)) {
      if (key === "_id") {
        result["id"] = (val as ObjectId).toString();
        continue;
      }
      // Skip a stored id field — id is derived from _id on the way out
      if (key === "id") continue;
      const shouldCoerce = explicitCoerce.has(key);
      if (shouldCoerce && typeof val === "string" && /^\d+$/.test(val)) {
        const parsed = Number(val);
        result[key] = Number.isSafeInteger(parsed) ? parsed : val;
      } else {
        result[key] = val;
      }
    }
    return result as T;
  }

  /**
   * Convert neutral-filter `id` conditions (string or operator object) to
   * `_id` ObjectId for index performance, recursing into logical branches.
   */
  protected normalizeQueryIds(query: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(query)) {
      if (key === "id") {
        if (typeof val === "string") {
          result["_id"] = this.toObjectId(val);
        } else if (typeof val === "object" && val !== null) {
          const converted: Record<string, any> = {};
          for (const [op, opVal] of Object.entries(val)) {
            if (Array.isArray(opVal)) {
              converted[op] = opVal.map((v) => typeof v === "string" ? this.toObjectId(v) : v);
            } else if (typeof opVal === "string") {
              converted[op] = this.toObjectId(opVal);
            } else {
              converted[op] = opVal;
            }
          }
          result["_id"] = converted;
        }
      } else if (
        (key === "$or" || key === "$and" || key === "$nor") &&
        Array.isArray(val)
      ) {
        result[key] = val.map((branch: any) => this.normalizeQueryIds(branch));
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  // ============================================================
  // StorageBackend operations
  // ============================================================

  /** Insert one public-shaped document (string `id` becomes `_id`). */
  async insertOne(doc: T, options?: BackendOpOptions): Promise<void> {
    const { id, ...rest } = doc as Record<string, any>;
    await this.collection.insertOne(
      { ...rest, _id: this.toObjectId(id) },
      { session: options?.session as ClientSession | undefined },
    );
  }

  /** Find the first match for a neutral filter, normalized, or null. */
  async findOne(filter: Filter<T>, options?: BackendOpOptions): Promise<T | null> {
    const item = await this.collection.findOne(
      this.normalizeQueryIds(filter as Record<string, any>),
      { session: options?.session as ClientSession | undefined },
    );
    return item ? this.normalize(item) : null;
  }

  /** Find every match for a neutral filter, normalized. */
  async findMany(filter: Filter<T>, options: FindManyOptions = {}): Promise<T[]> {
    const findOptions: Record<string, any> = {};
    if (options.limit !== undefined) findOptions.limit = options.limit;
    if (options.skip !== undefined) findOptions.skip = options.skip;
    if (options.sort !== undefined) findOptions.sort = options.sort;
    if (options.session !== undefined) findOptions.session = options.session;
    if (options.readPreference !== undefined) {
      findOptions.readPreference = options.readPreference;
    }
    if (options.select && options.select.length > 0) {
      findOptions.projection = options.select.reduce((acc, key) => {
        acc[key] = 1;
        return acc;
      }, {} as Record<string, 1>);
    }
    const items = await this.collection.find(
      this.normalizeQueryIds(filter as Record<string, any>),
      findOptions,
    ).toArray();
    return items.map((i) => this.normalize(i));
  }

  /** Count matches for a neutral filter. */
  count(filter: Filter<T>, options?: BackendOpOptions): Promise<number> {
    return this.collection.countDocuments(
      this.normalizeQueryIds(filter as Record<string, any>),
      { session: options?.session as ClientSession | undefined },
    );
  }

  /**
   * Apply dotted-path `$set`s to one document, with an atomic `$inc` on
   * `version` unless `bumpVersion: false`, honoring `expectedVersion` as an
   * optimistic-lock filter. Returns the post-update document or null.
   */
  async updatePaths(
    id: string,
    paths: Record<string, unknown>,
    options: UpdatePathsOptions = {},
  ): Promise<T | null> {
    const filter: Record<string, any> = { _id: this.toObjectId(id) };
    if (options.expectedVersion !== undefined) filter.version = options.expectedVersion;

    const update: Record<string, any> = { $set: paths };
    if (options.bumpVersion !== false) update.$inc = { version: 1 };

    const updated = await this.collection.findOneAndUpdate(
      filter,
      update,
      {
        returnDocument: "after",
        session: options.session as ClientSession | undefined,
      },
    );
    return updated ? this.normalize(updated) : null;
  }

  /** Hard-delete one document by id. Returns the deleted document or null. */
  async deleteOne(id: string, options?: BackendOpOptions): Promise<T | null> {
    const deleted = await this.collection.findOneAndDelete(
      { _id: this.toObjectId(id) },
      { session: options?.session as ClientSession | undefined },
    );
    return deleted ? this.normalize(deleted) : null;
  }

  /** Remove a top-level field from every document that has it (`$unset`). */
  async unsetField(field: string, options?: BackendOpOptions): Promise<number> {
    const res = await this.collection.updateMany(
      { [field]: { $exists: true } },
      { $unset: { [field]: "" } },
      { session: options?.session as ClientSession | undefined },
    );
    return res.modifiedCount;
  }
}
