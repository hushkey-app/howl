/**
 * Compiles the neutral filter grammar from `@hushkey/service-core` into
 * parametrized Postgres SQL over the fixed table shape
 * (`id TEXT PK, doc JSONB, …promoted generated columns`).
 *
 * Routing: `id` hits the primary-key column, promoted paths hit their typed
 * generated columns (real B-tree indexes, real planner statistics), everything
 * else compiles to JSONB operators on `doc`. Mongo null semantics are
 * preserved: an equality against null matches both JSON null and absent keys.
 *
 * @module
 */

/** Postgres types a promoted column can carry. */
export type PromotedType = "text" | "bigint" | "numeric" | "boolean";

/** A document path promoted to a typed generated column. */
export interface PromotedColumn {
  /** The generated column's name. */
  column: string;
  /** The document path segments the column derives from. */
  segments: string[];
  /** The column's Postgres type. */
  type: PromotedType;
}

/** A compiled WHERE clause: SQL text plus its positional parameters. */
export interface CompiledWhere {
  /** The WHERE expression (no `WHERE` keyword), `TRUE` for an empty filter. */
  text: string;
  /** Positional parameter values, aligned with `$<startParam>`-based refs. */
  params: unknown[];
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate a single identifier segment (path part, column, table). Throws on
 * anything that could escape quoting — identifiers come from developer config,
 * never user input, but the compiler refuses to interpolate them unchecked.
 */
export function assertIdent(segment: string): string {
  if (!IDENT_RE.test(segment)) {
    throw new Error(`[pg-service] invalid identifier: "${segment}"`);
  }
  return segment;
}

/** Build the JSONB extraction expression for a document path. */
function jsonbExpr(segments: string[]): string {
  return `doc${segments.map((s) => `->'${assertIdent(s)}'`).join("")}`;
}

class Compiler {
  params: unknown[] = [];

  constructor(
    private promoted: Map<string, PromotedColumn>,
    private startParam: number,
  ) {}

  private push(value: unknown): string {
    this.params.push(value);
    return `$${this.startParam + this.params.length - 1}`;
  }

  // A field resolves either to a typed column (promoted / id) or a JSONB
  // expression. Columns take raw parameter values; JSONB expressions take
  // JSON-encoded parameters cast with ::jsonb.
  private target(path: string): { expr: string; column: boolean; segments: string[] } {
    if (path === "id") return { expr: `id`, column: true, segments: ["id"] };
    const promoted = this.promoted.get(path);
    const segments = path.split(".").map(assertIdent);
    if (promoted) return { expr: `"${assertIdent(promoted.column)}"`, column: true, segments };
    return { expr: jsonbExpr(segments), column: false, segments };
  }

  private value(t: { column: boolean }, v: unknown): string {
    return t.column ? this.push(v) : `${this.push(JSON.stringify(v))}::jsonb`;
  }

  // Mongo null equality matches JSON null AND absent keys. A promoted column
  // is SQL NULL in both cases; a JSONB expression is SQL NULL only when the
  // key is absent, so the JSON-null case is checked explicitly.
  private nullMatch(t: { expr: string; column: boolean }): string {
    if (t.column) return `${t.expr} IS NULL`;
    return `(${t.expr} IS NULL OR ${t.expr} = 'null'::jsonb)`;
  }

  private fieldCondition(path: string, condition: unknown): string {
    const t = this.target(path);

    const isOperatorObject = condition !== null && typeof condition === "object" &&
      !Array.isArray(condition) &&
      Object.keys(condition).some((k) => k.startsWith("$"));

    if (!isOperatorObject) {
      if (condition === null) return this.nullMatch(t);
      return `${t.expr} = ${this.value(t, condition)}`;
    }

    const parts: string[] = [];
    for (const [op, v] of Object.entries(condition as Record<string, unknown>)) {
      parts.push(this.operator(t, op, v));
    }
    return parts.length === 1 ? parts[0] : `(${parts.join(" AND ")})`;
  }

  private operator(
    t: { expr: string; column: boolean; segments: string[] },
    op: string,
    v: unknown,
  ): string {
    switch (op) {
      case "$eq":
        return v === null ? this.nullMatch(t) : `${t.expr} = ${this.value(t, v)}`;
      case "$ne":
        // Mongo $ne matches documents where the field is absent, too —
        // IS DISTINCT FROM treats SQL NULL as a comparable value.
        if (v === null) return `NOT ${this.nullMatch(t)}`;
        return `${t.expr} IS DISTINCT FROM ${this.value(t, v)}`;
      case "$in": {
        const arr = v as unknown[];
        const nonNull = arr.filter((x) => x !== null);
        const hadNull = arr.length !== nonNull.length;
        const pieces: string[] = [];
        if (nonNull.length > 0) {
          pieces.push(`${t.expr} IN (${nonNull.map((x) => this.value(t, x)).join(", ")})`);
        }
        if (hadNull) pieces.push(this.nullMatch(t));
        if (pieces.length === 0) return "FALSE";
        return pieces.length === 1 ? pieces[0] : `(${pieces.join(" OR ")})`;
      }
      case "$nin": {
        const arr = v as unknown[];
        const nonNull = arr.filter((x) => x !== null);
        const hadNull = arr.length !== nonNull.length;
        const pieces: string[] = [];
        if (nonNull.length > 0) {
          // Absent fields must match $nin (Mongo semantics): NOT IN over SQL
          // NULL yields NULL, so allow IS NULL explicitly — unless the array
          // itself contains null, which excludes null-and-absent instead.
          const notIn = `${t.expr} NOT IN (${nonNull.map((x) => this.value(t, x)).join(", ")})`;
          pieces.push(hadNull ? notIn : `(${t.expr} IS NULL OR ${notIn})`);
        }
        if (hadNull) pieces.push(`NOT ${this.nullMatch(t)}`);
        if (pieces.length === 0) return "TRUE";
        return pieces.length === 1 ? pieces[0] : `(${pieces.join(" AND ")})`;
      }
      case "$gt":
        return `${t.expr} > ${this.value(t, v)}`;
      case "$gte":
        return `${t.expr} >= ${this.value(t, v)}`;
      case "$lt":
        return `${t.expr} < ${this.value(t, v)}`;
      case "$lte":
        return `${t.expr} <= ${this.value(t, v)}`;
      case "$exists": {
        // Key presence is a JSONB question even for promoted paths — a column
        // NULL cannot distinguish JSON null (present) from an absent key.
        const expr = jsonbExpr(t.segments);
        return v ? `${expr} IS NOT NULL` : `${expr} IS NULL`;
      }
      default:
        throw new Error(
          `[pg-service] unsupported filter operator "${op}" — the neutral grammar is ` +
            `$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists; anything richer belongs ` +
            `behind the .sql() escape hatch`,
        );
    }
  }

  compile(filter: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      if (key === "$or" || key === "$and") {
        const branches = (value as Record<string, unknown>[]).map((b) => `(${this.compile(b)})`);
        if (branches.length === 0) {
          parts.push(key === "$or" ? "FALSE" : "TRUE");
        } else {
          parts.push(`(${branches.join(key === "$or" ? " OR " : " AND ")})`);
        }
        continue;
      }
      if (key.startsWith("$")) {
        throw new Error(`[pg-service] unsupported top-level operator "${key}"`);
      }
      parts.push(this.fieldCondition(key, value));
    }
    return parts.length === 0 ? "TRUE" : parts.join(" AND ");
  }
}

/**
 * Compile a neutral filter into a parametrized WHERE clause.
 *
 * @param filter The neutral-grammar filter.
 * @param promoted Promoted-column routing map, keyed by dotted document path.
 * @param startParam First positional parameter number (`$1`-based) so the
 *   clause can follow earlier parameters in the same statement.
 * @returns The WHERE text and its parameter values.
 */
export function compileWhere(
  filter: Record<string, unknown>,
  promoted: Map<string, PromotedColumn>,
  startParam = 1,
): CompiledWhere {
  const compiler = new Compiler(promoted, startParam);
  const text = compiler.compile(filter);
  return { text, params: compiler.params };
}
