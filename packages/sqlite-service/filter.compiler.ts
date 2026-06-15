/**
 * Compiles the neutral filter grammar from `@hushkey/service-core` into
 * parametrized SQLite SQL over the fixed table shape
 * (`id TEXT PK, doc TEXT JSON, …promoted virtual generated columns`).
 *
 * Routing mirrors the Postgres compiler: `id` hits the primary key, promoted
 * paths hit their typed generated columns, everything else uses JSON
 * operators on `doc`. SQLite makes two things simpler than Postgres: `->>`
 * returns natively-typed values (numeric comparisons just work, no casts),
 * and it maps BOTH absent keys and JSON null to SQL NULL — which is exactly
 * Mongo's null-equality semantics, so `IS NULL` is the whole story. Key
 * presence ($exists) is asked via `json_type()`, which distinguishes the two.
 *
 * @module
 */

/** SQLite column affinities a promoted column can carry. */
export type PromotedType = "text" | "bigint" | "numeric" | "boolean";

/** A document path promoted to a typed virtual generated column. */
export interface PromotedColumn {
  /** The generated column's name. */
  column: string;
  /** The document path segments the column derives from. */
  segments: string[];
  /** The column's declared type (mapped to a SQLite affinity). */
  type: PromotedType;
}

/** A compiled WHERE clause: SQL text plus its positional parameters. */
export interface CompiledWhere {
  /** The WHERE expression (no `WHERE` keyword), `1` for an empty filter. */
  text: string;
  /** Positional parameter values, aligned with the `?` placeholders. */
  params: unknown[];
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate a single identifier segment (path part, column, table). Throws on
 * anything that could escape quoting — identifiers come from developer
 * config, never user input, but the compiler refuses to interpolate them
 * unchecked.
 */
export function assertIdent(segment: string): string {
  if (!IDENT_RE.test(segment)) {
    throw new Error(`[sqlite-service] invalid identifier: "${segment}"`);
  }
  return segment;
}

/** Build the JSONPath literal for a document path (`'$.a.b'`). */
export function jsonPath(segments: string[]): string {
  return `'$.${segments.map(assertIdent).join(".")}'`;
}

// SQLite cannot bind booleans; JSON booleans extract as 0/1 integers, so the
// parameter side matches by converting.
function bindable(v: unknown): unknown {
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

class Compiler {
  params: unknown[] = [];

  constructor(private promoted: Map<string, PromotedColumn>) {}

  private push(value: unknown): string {
    this.params.push(bindable(value));
    return "?";
  }

  // A field resolves to a typed column (promoted / id) or a `->>` extraction —
  // both yield natively-typed SQL values, so the parameter side is uniform.
  private target(path: string): { expr: string; segments: string[] } {
    if (path === "id") return { expr: "id", segments: ["id"] };
    const promoted = this.promoted.get(path);
    const segments = path.split(".").map(assertIdent);
    if (promoted) return { expr: `"${assertIdent(promoted.column)}"`, segments };
    return { expr: `doc->>${jsonPath(segments)}`, segments };
  }

  private fieldCondition(path: string, condition: unknown): string {
    const t = this.target(path);

    const isOperatorObject = condition !== null && typeof condition === "object" &&
      !Array.isArray(condition) &&
      Object.keys(condition).some((k) => k.startsWith("$"));

    if (!isOperatorObject) {
      if (condition === null) return `${t.expr} IS NULL`;
      if (typeof condition === "object") {
        // Whole-document equality compares JSON representations; `json(?)`
        // minifies the parameter the same way `->` renders the stored value.
        return `doc->${jsonPath(t.segments)} = json(${this.push(JSON.stringify(condition))})`;
      }
      return `${t.expr} = ${this.push(condition)}`;
    }

    const parts: string[] = [];
    for (const [op, v] of Object.entries(condition as Record<string, unknown>)) {
      parts.push(this.operator(t, op, v));
    }
    return parts.length === 1 ? parts[0] : `(${parts.join(" AND ")})`;
  }

  private scalarList(values: unknown[]): string {
    for (const v of values) {
      if (v !== null && typeof v === "object") {
        throw new Error(
          "[sqlite-service] $in/$nin support scalar values only — query objects through the .sqlite() escape hatch",
        );
      }
    }
    return values.map((v) => this.push(v)).join(", ");
  }

  private operator(
    t: { expr: string; segments: string[] },
    op: string,
    v: unknown,
  ): string {
    switch (op) {
      case "$eq":
        return this.fieldCondition(t.segments.join("."), v === null ? null : v);
      case "$ne":
        // Mongo $ne matches documents where the field is absent, too —
        // SQLite's IS NOT treats SQL NULL as a comparable value.
        if (v === null) return `${t.expr} IS NOT NULL`;
        return `${t.expr} IS NOT ${this.push(v)}`;
      case "$in": {
        const arr = v as unknown[];
        const nonNull = arr.filter((x) => x !== null);
        const hadNull = arr.length !== nonNull.length;
        const pieces: string[] = [];
        if (nonNull.length > 0) pieces.push(`${t.expr} IN (${this.scalarList(nonNull)})`);
        if (hadNull) pieces.push(`${t.expr} IS NULL`);
        if (pieces.length === 0) return "0";
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
          const notIn = `${t.expr} NOT IN (${this.scalarList(nonNull)})`;
          pieces.push(hadNull ? notIn : `(${t.expr} IS NULL OR ${notIn})`);
        }
        if (hadNull) pieces.push(`${t.expr} IS NOT NULL`);
        if (pieces.length === 0) return "1";
        return pieces.length === 1 ? pieces[0] : `(${pieces.join(" AND ")})`;
      }
      case "$gt":
        return `${t.expr} > ${this.push(v)}`;
      case "$gte":
        return `${t.expr} >= ${this.push(v)}`;
      case "$lt":
        return `${t.expr} < ${this.push(v)}`;
      case "$lte":
        return `${t.expr} <= ${this.push(v)}`;
      case "$exists":
        // `->>` maps JSON null and absent keys both to SQL NULL; json_type()
        // is the form that distinguishes presence.
        return v
          ? `json_type(doc, ${jsonPath(t.segments)}) IS NOT NULL`
          : `json_type(doc, ${jsonPath(t.segments)}) IS NULL`;
      default:
        throw new Error(
          `[sqlite-service] unsupported filter operator "${op}" — the neutral grammar is ` +
            `$eq $ne $in $nin $gt $gte $lt $lte $or $and $exists; anything richer belongs ` +
            `behind the .sqlite() escape hatch`,
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
          parts.push(key === "$or" ? "0" : "1");
        } else {
          parts.push(`(${branches.join(key === "$or" ? " OR " : " AND ")})`);
        }
        continue;
      }
      if (key.startsWith("$")) {
        throw new Error(`[sqlite-service] unsupported top-level operator "${key}"`);
      }
      parts.push(this.fieldCondition(key, value));
    }
    return parts.length === 0 ? "1" : parts.join(" AND ");
  }
}

/**
 * Compile a neutral filter into a parametrized WHERE clause.
 *
 * @param filter The neutral-grammar filter.
 * @param promoted Promoted-column routing map, keyed by dotted document path.
 * @returns The WHERE text (with `?` placeholders) and its parameter values.
 */
export function compileWhere(
  filter: Record<string, unknown>,
  promoted: Map<string, PromotedColumn>,
): CompiledWhere {
  const compiler = new Compiler(promoted);
  const text = compiler.compile(filter);
  return { text, params: compiler.params };
}
