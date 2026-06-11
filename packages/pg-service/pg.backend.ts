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
  type PromotedColumn,
  type PromotedType,
} from "./filter.compiler.ts";

/**
 * The duck-typed Postgres client the backend drives — `pg` (Pool/Client) and
 * Neon serverless satisfy it directly; postgres.js users wrap `sql.unsafe`.
 * No driver dependency, same posture as the Redis adapter.
 */
export interface PgClientLike {
  /** Execute parametrized SQL, returning at least the result rows. */
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** A document path promoted to a typed generated column. */
export type PromoteSpec = string | {
  /** Dotted document path (e.g. `"organisation_id"`, `"profile.plan"`). */
  path: string;
  /** Column type; defaults to `text`. */
  type?: PromotedType;
};

/** Storage configuration for a {@link PgBackend}. */
export interface PgBackendOptions {
  /** The table name (one collection = one table). */
  collectionName: string;
  /** Log swallowed index/DDL errors via `console.debug` (default false). */
  debug?: boolean;
  /**
   * Document paths to promote into typed generated columns (B-tree indexed,
   * real planner statistics). `version` and `meta.deleted_at` are always
   * promoted implicitly. Changing this list is the only DDL a schema change
   * ever needs — `ensureTable()` diffs it mechanically on construction.
   */
  promote?: PromoteSpec[];
  /** Fields to promote with a UNIQUE index. */
  uniqueFields?: string[];
  /** Additional indexes (promoted columns or JSONB expression terms). */
  indexes?: IndexSpec[];
}

// The recursive deep-set used by updatePaths: jsonb_set() alone does not
// create missing intermediate objects, which would silently drop a patch to
// a path whose parent the stored document lacks (lost write).
const DEEP_SET_FN = `
CREATE OR REPLACE FUNCTION howl_jsonb_deep_set(target jsonb, path text[], val jsonb)
RETURNS jsonb AS $$
BEGIN
  IF array_length(path, 1) = 1 THEN
    RETURN jsonb_set(COALESCE(target, '{}'::jsonb), path, val, true);
  END IF;
  RETURN jsonb_set(
    COALESCE(target, '{}'::jsonb),
    path[1:1],
    howl_jsonb_deep_set(
      CASE WHEN jsonb_typeof(target -> path[1]) = 'object'
        THEN target -> path[1] ELSE '{}'::jsonb END,
      path[2:],
      val
    ),
    true
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
`;

/**
 * Postgres implementation of the `@hushkey/service-core` storage contract.
 *
 * Storage layout (HANDOFF §6 — hybrid, not pure-generic JSONB, not
 * column-per-field): a fixed table shape `id TEXT PRIMARY KEY, doc JSONB`
 * plus typed GENERATED ALWAYS … STORED columns for promoted paths. Because
 * the shape is fixed, schema changes need no migration framework — only the
 * `promote` list changes DDL, applied idempotently at construction. The
 * filter compiler routes promoted predicates to columns and the rest to
 * JSONB operators.
 *
 * @typeParam T The public document shape.
 */
export class PgBackend<T extends DocumentShape> implements StorageBackend<T> {
  /** Cache-key namespace for SQL-backed services. */
  readonly cachePrefix = "sql";

  readonly #table: string;
  readonly #promoted: Map<string, PromotedColumn>;
  readonly #ready: Promise<void>;

  /**
   * Create a backend over one table, ensuring the table shape, the deep-set
   * function, promoted columns, and indexes exist (idempotent DDL).
   *
   * @param client The duck-typed Postgres client.
   * @param options Table name and storage options.
   */
  constructor(
    protected client: PgClientLike,
    protected options: PgBackendOptions,
  ) {
    this.#table = assertIdent(options.collectionName);
    this.#promoted = this.#buildPromotedMap();
    this.#ready = this.#ensureTable();
    // Ops await #ready and surface the failure; this handler only prevents an
    // unhandled rejection from killing the process before the first op runs.
    this.#ready.catch(() => {});
  }

  /** Generate a new document id (a UUID). */
  generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Escape hatch: the underlying client for raw SQL. Call sites using it are
   * permanently backend-specific and bypass the service contract.
   */
  get sql(): PgClientLike {
    return this.client;
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
        throw new Error(`[pg-service] cannot promote to reserved column "${name}"`);
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

  #generatedExpr(p: PromotedColumn): string {
    const path = `'{${p.segments.join(",")}}'`;
    const text = `(doc #>> ${path})`;
    return p.type === "text" ? text : `((${text})::${p.type})`;
  }

  async #ensureTable(): Promise<void> {
    const t = this.#table;
    const version = this.#promoted.get("version")!;
    const deletedAt = this.#promoted.get("meta.deleted_at")!;
    // Table + always-promoted columns must exist before any op; failures here
    // reject #ready and fail every subsequent operation loudly.
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS "${t}" (
        id TEXT PRIMARY KEY,
        doc JSONB NOT NULL,
        "${version.column}" BIGINT GENERATED ALWAYS AS ${this.#generatedExpr(version)} STORED,
        "${deletedAt.column}" BIGINT GENERATED ALWAYS AS ${this.#generatedExpr(deletedAt)} STORED
      )
    `);
    await this.client.query(DEEP_SET_FN);
    await this.#ensureColumn(version, false);
    await this.#ensureColumn(deletedAt, false);
    await this.#run(
      `CREATE INDEX IF NOT EXISTS "${t}_active_idx" ON "${t}" (id) WHERE "${deletedAt.column}" IS NULL`,
      { index: `${t}_active_idx` },
    );

    const unique = new Set(this.options.uniqueFields ?? []);
    for (const [path, p] of this.#promoted) {
      if (path === "version" || path === "meta.deleted_at") continue;
      await this.#ensureColumn(p, unique.has(path));
    }
    for (const idx of this.options.indexes ?? []) {
      await this.#ensureIndexSpec(idx);
    }
  }

  // Promoted-column DDL is the mechanical ensure idiom: ADD COLUMN IF NOT
  // EXISTS diffed from config, caught-and-logged per column so a bad promote
  // entry (e.g. an existing column with a different expression) degrades to
  // JSONB-path filtering instead of killing startup.
  async #ensureColumn(p: PromotedColumn, isUnique: boolean): Promise<void> {
    const t = this.#table;
    await this.#run(
      `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${p.column}" ${p.type.toUpperCase()} ` +
        `GENERATED ALWAYS AS ${this.#generatedExpr(p)} STORED`,
      { column: p.column },
    );
    const kind = isUnique ? "UNIQUE INDEX" : "INDEX";
    const suffix = isUnique ? "key" : "idx";
    await this.#run(
      `CREATE ${kind} IF NOT EXISTS "${t}_${p.column}_${suffix}" ON "${t}" ("${p.column}")`,
      { index: `${t}_${p.column}_${suffix}` },
    );
  }

  async #ensureIndexSpec(idx: IndexSpec): Promise<void> {
    const t = this.#table;
    const terms = Object.entries(idx.keys).map(([path, dir]) => {
      const direction = dir === -1 ? " DESC" : "";
      const promoted = this.#promoted.get(path);
      if (path === "id") return `id${direction}`;
      if (promoted) return `"${promoted.column}"${direction}`;
      const segments = path.split(".").map(assertIdent);
      return `(doc #> '{${segments.join(",")}}')${direction}`;
    });
    const name = assertIdent(
      idx.options?.name ?? `${t}_${Object.keys(idx.keys).join("_").replaceAll(".", "_")}_idx`,
    );
    const kind = idx.options?.unique ? "UNIQUE INDEX" : "INDEX";
    await this.#run(
      `CREATE ${kind} IF NOT EXISTS "${name}" ON "${t}" (${terms.join(", ")})`,
      { index: name },
    );
  }

  async #run(sql: string, context: Record<string, unknown>): Promise<void> {
    try {
      await this.client.query(sql);
    } catch (error) {
      if (this.options.debug) {
        console.debug("[PgBackend]", {
          operation: "DDL_ERROR",
          table: this.#table,
          ...context,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  #exec(options?: BackendOpOptions): PgClientLike {
    return (options?.session as PgClientLike | undefined) ?? this.client;
  }

  #toDoc(row: Record<string, unknown>): T {
    return { ...(row.doc as Record<string, unknown>), id: row.id } as T;
  }

  #orderBy(sort?: Record<string, 1 | -1>): string {
    if (!sort || Object.keys(sort).length === 0) return "";
    const terms = Object.entries(sort).map(([path, dir]) => {
      const direction = dir === -1 ? "DESC" : "ASC";
      if (path === "id") return `id ${direction}`;
      const promoted = this.#promoted.get(path);
      if (promoted) return `"${promoted.column}" ${direction}`;
      const segments = path.split(".").map(assertIdent);
      return `doc #> '{${segments.join(",")}}' ${direction}`;
    });
    return ` ORDER BY ${terms.join(", ")}`;
  }

  // ============================================================
  // StorageBackend operations
  // ============================================================

  /** Insert one public-shaped document (string `id` becomes the PK). */
  async insertOne(doc: T, options?: BackendOpOptions): Promise<void> {
    await this.#ready;
    const { id, ...rest } = doc as Record<string, any>;
    await this.#exec(options).query(
      `INSERT INTO "${this.#table}" (id, doc) VALUES ($1, $2::jsonb)`,
      [id, JSON.stringify(rest)],
    );
  }

  /** Find the first match for a neutral filter, or null. */
  async findOne(filter: Filter<T>, options?: BackendOpOptions): Promise<T | null> {
    await this.#ready;
    const where = compileWhere(filter as Record<string, unknown>, this.#promoted);
    const { rows } = await this.#exec(options).query(
      `SELECT id, doc FROM "${this.#table}" WHERE ${where.text} LIMIT 1`,
      where.params,
    );
    return rows.length > 0 ? this.#toDoc(rows[0]) : null;
  }

  /** Find every match for a neutral filter, honoring the options. */
  async findMany(filter: Filter<T>, options: FindManyOptions = {}): Promise<T[]> {
    await this.#ready;
    const where = compileWhere(filter as Record<string, unknown>, this.#promoted);
    const params: unknown[] = [...where.params];
    let sql = `SELECT id, doc FROM "${this.#table}" WHERE ${where.text}${
      this.#orderBy(options.sort)
    }`;
    if (options.limit !== undefined) {
      params.push(options.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (options.skip !== undefined) {
      params.push(options.skip);
      sql += ` OFFSET $${params.length}`;
    }
    const { rows } = await this.#exec(options).query(sql, params);
    let docs = rows.map((r) => this.#toDoc(r));
    // Projection happens after fetch: documents live in one JSONB value, so a
    // SQL-side projection would rebuild objects for no I/O win at these sizes.
    if (options.select && options.select.length > 0) {
      const keep = new Set<string>([...options.select, "id"]);
      docs = docs.map((d) =>
        Object.fromEntries(
          Object.entries(d as Record<string, unknown>).filter(([k]) => keep.has(k)),
        ) as unknown as T
      );
    }
    return docs;
  }

  /** Count matches for a neutral filter. */
  async count(filter: Filter<T>, options?: BackendOpOptions): Promise<number> {
    await this.#ready;
    const where = compileWhere(filter as Record<string, unknown>, this.#promoted);
    const { rows } = await this.#exec(options).query(
      `SELECT COUNT(*)::int AS count FROM "${this.#table}" WHERE ${where.text}`,
      where.params,
    );
    return Number(rows[0].count);
  }

  /**
   * Apply dotted-path updates to one document's JSONB, atomically with the
   * optional version bump/lock, in a single UPDATE. Returns the post-update
   * document, or null when no row matched (absent id or failed
   * `expectedVersion`).
   */
  async updatePaths(
    id: string,
    paths: Record<string, unknown>,
    options: UpdatePathsOptions = {},
  ): Promise<T | null> {
    await this.#ready;
    const params: unknown[] = [id];
    let expr = "doc";
    for (const [path, value] of Object.entries(paths)) {
      if (value === undefined) continue;
      const segments = path.split(".").map(assertIdent);
      params.push(JSON.stringify(value ?? null));
      expr = `howl_jsonb_deep_set(${expr}, '{${segments.join(",")}}', $${params.length}::jsonb)`;
    }
    if (options.bumpVersion !== false) {
      // RHS `doc` is the pre-update row value — the increment is atomic.
      expr = `jsonb_set(${expr}, '{version}', to_jsonb(((doc->>'version'))::bigint + 1), true)`;
    }
    let where = `id = $1`;
    if (options.expectedVersion !== undefined) {
      params.push(options.expectedVersion);
      where += ` AND "${this.#promoted.get("version")!.column}" = $${params.length}`;
    }
    const { rows } = await this.#exec(options).query(
      `UPDATE "${this.#table}" SET doc = ${expr} WHERE ${where} RETURNING id, doc`,
      params,
    );
    return rows.length > 0 ? this.#toDoc(rows[0]) : null;
  }

  /** Hard-delete one document by id. Returns the deleted document, or null. */
  async deleteOne(id: string, options?: BackendOpOptions): Promise<T | null> {
    await this.#ready;
    const { rows } = await this.#exec(options).query(
      `DELETE FROM "${this.#table}" WHERE id = $1 RETURNING id, doc`,
      [id],
    );
    return rows.length > 0 ? this.#toDoc(rows[0]) : null;
  }
}
