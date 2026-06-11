// deno-lint-ignore-file no-explicit-any
import type {
  BackendOpOptions,
  DocumentShape,
  Filter,
  FindManyOptions,
  IndexSpec,
  StorageBackend,
  UpdatePathsOptions,
} from "@hushkey/service-core";
import {
  assertIdent,
  compileWhere,
  jsonPath,
  type PromotedColumn,
  type PromotedType,
} from "./filter.compiler.ts";

/** A prepared statement in the duck-typed SQLite client. */
export interface SqliteStatementLike {
  /** Execute and return all result rows. */
  all(...params: unknown[]): unknown[];
  /** Execute for side effects (no result rows needed). */
  run(...params: unknown[]): unknown;
}

/**
 * The duck-typed SQLite handle the backend drives — Deno's built-in
 * `node:sqlite` `DatabaseSync` satisfies it directly (zero dependencies, no
 * WASM), as does better-sqlite3 on Node.
 */
export interface SqliteDbLike {
  /** Prepare a parametrized statement (`?` placeholders). */
  prepare(sql: string): SqliteStatementLike;
  /** Execute DDL / pragma statements. */
  exec(sql: string): void;
}

/** A document path promoted to a typed virtual generated column. */
export type PromoteSpec = string | {
  /** Dotted document path (e.g. `"organisation_id"`, `"profile.plan"`). */
  path: string;
  /** Column type; defaults to `text`. */
  type?: PromotedType;
};

/** Storage configuration for a {@link SqliteBackend}. */
export interface SqliteBackendOptions {
  /** The table name (one collection = one table). */
  collectionName: string;
  /** Log swallowed DDL errors via `console.debug` (default false). */
  debug?: boolean;
  /**
   * Document paths to promote into typed virtual generated columns (indexed).
   * `version` and `meta.deleted_at` are always promoted implicitly. Changing
   * this list is the only DDL a schema change ever needs — ensured
   * idempotently at construction.
   */
  promote?: PromoteSpec[];
  /** Fields to promote with a UNIQUE index. */
  uniqueFields?: string[];
  /** Additional indexes (promoted columns or JSON expression terms). */
  indexes?: IndexSpec[];
}

const AFFINITY: Record<PromotedType, string> = {
  text: "TEXT",
  bigint: "INTEGER",
  numeric: "NUMERIC",
  boolean: "INTEGER",
};

/**
 * SQLite implementation of the `@hushkey/service-core` storage contract,
 * built for Deno's native `node:sqlite` — the zero-infra rung of the storage
 * ladder (dev, small apps, `deno compile` single-binary deployments).
 *
 * Same hybrid layout as the Postgres backend: a fixed table shape
 * (`id TEXT PRIMARY KEY, doc TEXT` holding JSON) plus typed
 * `GENERATED ALWAYS … VIRTUAL` columns for promoted paths (`ALTER TABLE`
 * cannot add STORED ones; VIRTUAL columns are still indexable, which is all
 * the promote mechanism needs). No migration framework — only the `promote`
 * list changes DDL, applied idempotently at construction.
 *
 * Single-writer storage (WAL mode is enabled best-effort); per-process. This
 * is the bottom rung by design — moving up the ladder is what the shared
 * contract is for.
 *
 * @typeParam T The public document shape.
 */
export class SqliteBackend<T extends DocumentShape> implements StorageBackend<T> {
  /** Cache-key namespace for SQLite-backed services. */
  readonly cachePrefix = "sqlite";

  readonly #table: string;
  readonly #promoted: Map<string, PromotedColumn>;

  /**
   * Create a backend over one table, ensuring the table shape, promoted
   * columns, and indexes exist (idempotent, synchronous DDL).
   *
   * @param db The duck-typed SQLite handle (`node:sqlite` `DatabaseSync`).
   * @param options Table name and storage options.
   */
  constructor(
    protected db: SqliteDbLike,
    protected options: SqliteBackendOptions,
  ) {
    this.#table = assertIdent(options.collectionName);
    this.#promoted = this.#buildPromotedMap();
    this.#ensureTable();
  }

  /** Generate a new document id (a UUID). */
  generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Escape hatch: the underlying SQLite handle for raw SQL. Call sites using
   * it are permanently backend-specific and bypass the service contract.
   */
  get sqlite(): SqliteDbLike {
    return this.db;
  }

  // ============================================================
  // Table shape
  // ============================================================

  #buildPromotedMap(): Map<string, PromotedColumn> {
    const map = new Map<string, PromotedColumn>();
    const add = (path: string, type: PromotedType, column?: string) => {
      const segments = path.split(".").map(assertIdent);
      const name = assertIdent(column ?? path.replaceAll(".", "_"));
      if (name === "id" || name === "doc") {
        throw new Error(`[sqlite-service] cannot promote to reserved column "${name}"`);
      }
      map.set(path, { column: name, segments, type });
    };
    // The fixed shape: version (optimistic lock) and the soft-delete stamp.
    add("version", "bigint");
    add("meta.deleted_at", "bigint", "deleted_at");
    for (const field of this.options.uniqueFields ?? []) add(field, "text");
    for (const spec of this.options.promote ?? []) {
      if (typeof spec === "string") add(spec, "text");
      else add(spec.path, spec.type ?? "text");
    }
    return map;
  }

  #generatedSql(p: PromotedColumn): string {
    return `"${p.column}" ${AFFINITY[p.type]} GENERATED ALWAYS AS (doc->>${
      jsonPath(p.segments)
    }) VIRTUAL`;
  }

  #ensureTable(): void {
    const t = this.#table;
    const version = this.#promoted.get("version")!;
    const deletedAt = this.#promoted.get("meta.deleted_at")!;
    // WAL improves single-writer concurrency for file databases; harmless
    // (and a no-op) for :memory:.
    try {
      this.db.exec("PRAGMA journal_mode = WAL");
    } catch {
      //@silent-catch decided=2026-06-11 reason=pragma is an optimization; read-only or exotic VFS must not break startup
    }
    // Table + always-promoted columns must exist before any op; a failure
    // here throws out of the constructor, loudly.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "${t}" (
        id TEXT PRIMARY KEY,
        doc TEXT NOT NULL CHECK (json_valid(doc)),
        ${this.#generatedSql(version)},
        ${this.#generatedSql(deletedAt)}
      )
    `);
    this.#run(
      `CREATE INDEX IF NOT EXISTS "${t}_active_idx" ON "${t}" (id) WHERE "${deletedAt.column}" IS NULL`,
      { index: `${t}_active_idx` },
    );
    this.#run(
      `CREATE INDEX IF NOT EXISTS "${t}_${version.column}_idx" ON "${t}" ("${version.column}")`,
      { index: `${t}_${version.column}_idx` },
    );

    const unique = new Set(this.options.uniqueFields ?? []);
    for (const [path, p] of this.#promoted) {
      if (path === "version" || path === "meta.deleted_at") continue;
      this.#ensureColumn(p, unique.has(path));
    }
    for (const idx of this.options.indexes ?? []) {
      this.#ensureIndexSpec(idx);
    }
  }

  // SQLite has no ADD COLUMN IF NOT EXISTS — the duplicate-column error is
  // the idempotency signal, caught per column like the other backends' index
  // ensures.
  #ensureColumn(p: PromotedColumn, isUnique: boolean): void {
    const t = this.#table;
    try {
      this.db.exec(`ALTER TABLE "${t}" ADD COLUMN ${this.#generatedSql(p)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("duplicate column")) {
        this.#logDdlError({ column: p.column }, error);
      }
    }
    const kind = isUnique ? "UNIQUE INDEX" : "INDEX";
    const suffix = isUnique ? "key" : "idx";
    this.#run(
      `CREATE ${kind} IF NOT EXISTS "${t}_${p.column}_${suffix}" ON "${t}" ("${p.column}")`,
      { index: `${t}_${p.column}_${suffix}` },
    );
  }

  #ensureIndexSpec(idx: IndexSpec): void {
    const t = this.#table;
    const terms = Object.entries(idx.keys).map(([path, dir]) => {
      const direction = dir === -1 ? " DESC" : "";
      if (path === "id") return `id${direction}`;
      const promoted = this.#promoted.get(path);
      if (promoted) return `"${promoted.column}"${direction}`;
      const segments = path.split(".").map(assertIdent);
      return `(doc->>${jsonPath(segments)})${direction}`;
    });
    const name = assertIdent(
      idx.options?.name ?? `${t}_${Object.keys(idx.keys).join("_").replaceAll(".", "_")}_idx`,
    );
    const kind = idx.options?.unique ? "UNIQUE INDEX" : "INDEX";
    this.#run(`CREATE ${kind} IF NOT EXISTS "${name}" ON "${t}" (${terms.join(", ")})`, {
      index: name,
    });
  }

  #run(sql: string, context: Record<string, unknown>): void {
    try {
      this.db.exec(sql);
    } catch (error) {
      this.#logDdlError(context, error);
    }
  }

  #logDdlError(context: Record<string, unknown>, error: unknown): void {
    if (!this.options.debug) return;
    console.debug("[SqliteBackend]", {
      operation: "DDL_ERROR",
      table: this.#table,
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // ============================================================
  // Helpers
  // ============================================================

  #handle(options?: BackendOpOptions): SqliteDbLike {
    return (options?.session as SqliteDbLike | undefined) ?? this.db;
  }

  #toDoc(row: Record<string, unknown>): T {
    return { ...JSON.parse(row.doc as string), id: row.id } as T;
  }

  #orderBy(sort?: Record<string, 1 | -1>): string {
    if (!sort || Object.keys(sort).length === 0) return "";
    const terms = Object.entries(sort).map(([path, dir]) => {
      const direction = dir === -1 ? "DESC" : "ASC";
      if (path === "id") return `id ${direction}`;
      const promoted = this.#promoted.get(path);
      if (promoted) return `"${promoted.column}" ${direction}`;
      const segments = path.split(".").map(assertIdent);
      return `doc->>${jsonPath(segments)} ${direction}`;
    });
    return ` ORDER BY ${terms.join(", ")}`;
  }

  // Rebuild the nested object json_patch() expects from dotted leaf paths.
  #denest(paths: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(paths)) {
      const segments = key.split(".");
      let node = result;
      for (let i = 0; i < segments.length - 1; i++) {
        node = (node[segments[i]] ??= {}) as Record<string, unknown>;
      }
      node[segments[segments.length - 1]] = value;
    }
    return result;
  }

  // ============================================================
  // StorageBackend operations
  // ============================================================

  /** Insert one public-shaped document (string `id` becomes the PK). */
  insertOne(doc: T, options?: BackendOpOptions): Promise<void> {
    const { id, ...rest } = doc as Record<string, any>;
    this.#handle(options).prepare(
      `INSERT INTO "${this.#table}" (id, doc) VALUES (?, ?)`,
    ).run(id, JSON.stringify(rest));
    return Promise.resolve();
  }

  /** Find the first match for a neutral filter, or null. */
  findOne(filter: Filter<T>, options?: BackendOpOptions): Promise<T | null> {
    const where = compileWhere(filter as Record<string, unknown>, this.#promoted);
    const rows = this.#handle(options).prepare(
      `SELECT id, doc FROM "${this.#table}" WHERE ${where.text} LIMIT 1`,
    ).all(...where.params) as Record<string, unknown>[];
    return Promise.resolve(rows.length > 0 ? this.#toDoc(rows[0]) : null);
  }

  /** Find every match for a neutral filter, honoring the options. */
  findMany(filter: Filter<T>, options: FindManyOptions = {}): Promise<T[]> {
    const where = compileWhere(filter as Record<string, unknown>, this.#promoted);
    const params: unknown[] = [...where.params];
    let sql = `SELECT id, doc FROM "${this.#table}" WHERE ${where.text}${
      this.#orderBy(options.sort)
    }`;
    if (options.limit !== undefined || options.skip !== undefined) {
      // OFFSET requires LIMIT in SQLite; -1 means unbounded.
      params.push(options.limit ?? -1);
      sql += ` LIMIT ?`;
      if (options.skip !== undefined) {
        params.push(options.skip);
        sql += ` OFFSET ?`;
      }
    }
    const rows = this.#handle(options).prepare(sql).all(...params) as Record<string, unknown>[];
    let docs = rows.map((r) => this.#toDoc(r));
    // Projection happens after fetch: documents live in one JSON value, so a
    // SQL-side projection would rebuild objects for no I/O win at these sizes.
    if (options.select && options.select.length > 0) {
      const keep = new Set<string>([...options.select, "id"]);
      docs = docs.map((d) =>
        Object.fromEntries(
          Object.entries(d as Record<string, unknown>).filter(([k]) => keep.has(k)),
        ) as unknown as T
      );
    }
    return Promise.resolve(docs);
  }

  /** Count matches for a neutral filter. */
  count(filter: Filter<T>, options?: BackendOpOptions): Promise<number> {
    const where = compileWhere(filter as Record<string, unknown>, this.#promoted);
    const rows = this.#handle(options).prepare(
      `SELECT COUNT(*) AS count FROM "${this.#table}" WHERE ${where.text}`,
    ).all(...where.params) as Record<string, unknown>[];
    return Promise.resolve(Number(rows[0].count));
  }

  /**
   * Apply dotted-path updates to one document's JSON, atomically with the
   * optional version bump/lock, in a single UPDATE … RETURNING. Returns the
   * post-update document, or null when no row matched (absent id or failed
   * `expectedVersion`).
   *
   * Non-null values merge in via `json_patch()` (RFC 7386 — creates missing
   * parent objects, replaces arrays whole). Null values cannot ride the
   * patch: RFC 7386 defines null as key REMOVAL, and the meta contract
   * distinguishes a stored null from an absent key — so null paths are
   * chained as explicit `json_set(…, null)` calls after the patch.
   */
  updatePaths(
    id: string,
    paths: Record<string, unknown>,
    options: UpdatePathsOptions = {},
  ): Promise<T | null> {
    const params: unknown[] = [];
    const nonNull: Record<string, unknown> = {};
    const nullPaths: string[] = [];
    for (const [path, value] of Object.entries(paths)) {
      if (value === undefined) continue;
      if (value === null) nullPaths.push(path);
      else nonNull[path] = value;
    }

    let expr = `json_patch(doc, json(?))`;
    params.push(JSON.stringify(this.#denest(nonNull)));
    for (const path of nullPaths) {
      const segments = path.split(".").map(assertIdent);
      expr = `json_set(${expr}, ${jsonPath(segments)}, null)`;
    }
    if (options.bumpVersion !== false) {
      // RHS `doc` is the pre-update row value — the increment is atomic.
      expr = `json_set(${expr}, '$.version', (doc->>'$.version') + 1)`;
    }

    params.push(id);
    let where = `id = ?`;
    if (options.expectedVersion !== undefined) {
      params.push(options.expectedVersion);
      where += ` AND "${this.#promoted.get("version")!.column}" = ?`;
    }

    const rows = this.#handle(options).prepare(
      `UPDATE "${this.#table}" SET doc = ${expr} WHERE ${where} RETURNING id, doc`,
    ).all(...params) as Record<string, unknown>[];
    return Promise.resolve(rows.length > 0 ? this.#toDoc(rows[0]) : null);
  }

  /** Hard-delete one document by id. Returns the deleted document, or null. */
  deleteOne(id: string, options?: BackendOpOptions): Promise<T | null> {
    const rows = this.#handle(options).prepare(
      `DELETE FROM "${this.#table}" WHERE id = ? RETURNING id, doc`,
    ).all(id) as Record<string, unknown>[];
    return Promise.resolve(rows.length > 0 ? this.#toDoc(rows[0]) : null);
  }
}
