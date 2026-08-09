/**
 * The Redis query planner: turns a neutral filter into **set operations the
 * server can run**, plus a residual filter for whatever the indexes cannot
 * answer.
 *
 * Redis has no query engine, so this is the equivalent of the SQL backends'
 * filter compilers. Declared paths get physical indexes — a `SET` of ids per
 * distinct value (`tag`) or a `ZSET` scored by the value (`number`) — and the
 * planner reduces a filter to an intersection over them. Anything unplanned
 * (an undeclared path, `$exists`, `$ne`, a null equality) still returns the
 * right documents: the plan narrows soundly and the caller re-checks the full
 * filter in process.
 *
 * Soundness rule for every source emitted here: **every matching document must
 * be in it**. A source may over-select (the re-check removes the extras); it
 * may never under-select.
 *
 * @module
 */
import { isOperatorCondition } from "./filter.matcher.ts";

/** How a declared path is indexed. */
export type IndexKind =
  /** A `SET` of ids per distinct value — equality and `$in`. */
  | "tag"
  /** A `ZSET` scored by the numeric value — ranges, equality and sorting. */
  | "number";

/** A document path to index, and how. */
export type RedisIndexSpec = string | {
  /** Dotted document path (e.g. `"status"`, `"profile.plan"`). */
  path: string;
  /** Index kind; defaults to `tag`. */
  kind?: IndexKind;
};

/**
 * Whether a value gets a tag-index entry. Only scalars: two equal objects can
 * serialize to different JSON (key order), so an object-keyed index could miss
 * a document a whole-value equality should match — and missing a match is the
 * one thing an index may never do. Object/array equality falls to the
 * in-process re-check, which compares them structurally.
 */
export function isIndexableValue(value: unknown): value is string | number | boolean {
  const type = typeof value;
  return type === "string" || type === "boolean" ||
    (type === "number" && Number.isFinite(value as number));
}

/** The key namespace for one collection. */
export interface RedisKeys {
  /** The hash-tagged prefix every key of this collection shares. */
  readonly base: string;
  /** Key holding one document's JSON. */
  doc(id: string): string;
  /** ZSET of every id (score 0 — lexicographic, so uuidv7 sorts by time). */
  readonly ids: string;
  /** ZSET of ids whose `meta.deleted_at` is null (the soft-delete live set). */
  readonly active: string;
  /** SET of ids carrying `value` at `path`. */
  tag(path: string, value: unknown): string;
  /** ZSET of ids scored by their numeric value at `path`. */
  number(path: string): string;
}

/**
 * Build the key namespace for a collection. Every key shares one hash tag
 * (`{prefix:collection}`) so a whole collection lives in a single Redis
 * Cluster slot — multi-key operations (`ZINTER`, the write scripts) stay legal
 * on a cluster.
 *
 * @param prefix Global key prefix (namespaces the app).
 * @param collection The collection name.
 * @returns The key builders for that collection.
 */
export function makeKeys(prefix: string, collection: string): RedisKeys {
  const base = `{${prefix}:${collection}}`;
  return {
    base,
    ids: `${base}:ids`,
    active: `${base}:active`,
    doc: (id) => `${base}:d:${id}`,
    tag: (path, value) => `${base}:t:${path}:${JSON.stringify(value ?? null)}`,
    number: (path) => `${base}:n:${path}`,
  };
}

/** A candidate-id source the planner emits. */
export type PlanSource =
  /** Ids present in every one of these SET/ZSET keys. */
  | { kind: "intersect"; keys: string[] }
  /** Ids present in at least one of these SET keys. */
  | { kind: "union"; keys: string[] }
  /** Ids in this ZSET whose score falls inside the (Redis-formatted) range. */
  | { kind: "range"; key: string; min: string; max: string };

/** A compiled query plan. */
export interface QueryPlan {
  /**
   * The starting id set: `active` for the default live-documents query,
   * `ids` when soft-deleted documents are in scope.
   */
  base: string;
  /** Index sources to intersect with the base (all must hold the id). */
  sources: PlanSource[];
  /**
   * Whether the plan alone is exact. When false the caller must fetch the
   * candidates and re-check the original filter in process.
   */
  exact: boolean;
  /**
   * Whether anything narrowed the base. False means a full scan of `base` —
   * correct, but O(collection); the declared index list is the tuning knob.
   */
  scan: boolean;
}

/** Resolve the declared index list into a path → kind map. */
export function indexMap(specs: RedisIndexSpec[] = []): Map<string, IndexKind> {
  const map = new Map<string, IndexKind>();
  for (const spec of specs) {
    if (typeof spec === "string") map.set(spec, "tag");
    else map.set(spec.path, spec.kind ?? "tag");
  }
  return map;
}

const DELETED_AT = "meta.deleted_at";

function isNullCondition(condition: unknown): boolean {
  if (condition === null) return true;
  return isOperatorCondition(condition) &&
    Object.keys(condition as object).length === 1 &&
    (condition as { $eq?: unknown }).$eq === null;
}

function isNotNullCondition(condition: unknown): boolean {
  return isOperatorCondition(condition) &&
    Object.keys(condition as object).length === 1 &&
    (condition as { $ne?: unknown }).$ne === null;
}

// A tag index holds only documents that carry the value, so it can answer
// equality and $in — but never a null equality (which must also match absent
// keys) or a negation (which must match them too).
function tagSource(
  path: string,
  condition: unknown,
  keys: RedisKeys,
): { source: PlanSource; exact: boolean } | null {
  if (!isOperatorCondition(condition)) {
    if (!isIndexableValue(condition)) return null;
    return { source: { kind: "intersect", keys: [keys.tag(path, condition)] }, exact: true };
  }
  const ops = condition as Record<string, unknown>;
  const opNames = Object.keys(ops);
  if (opNames.length !== 1) return null;
  if (opNames[0] === "$eq" && isIndexableValue(ops.$eq)) {
    return { source: { kind: "intersect", keys: [keys.tag(path, ops.$eq)] }, exact: true };
  }
  if (opNames[0] === "$in" && Array.isArray(ops.$in)) {
    const values = ops.$in as unknown[];
    if (values.length === 0 || !values.every(isIndexableValue)) return null;
    return {
      source: { kind: "union", keys: values.map((v) => keys.tag(path, v)) },
      exact: true,
    };
  }
  return null;
}

// A number index holds only documents whose value at the path is a finite
// number — exactly the documents a range can match.
function numberSource(
  path: string,
  condition: unknown,
  keys: RedisKeys,
): { source: PlanSource; exact: boolean } | null {
  const key = keys.number(path);
  if (!isOperatorCondition(condition)) {
    if (typeof condition !== "number" || !Number.isFinite(condition)) return null;
    return {
      source: { kind: "range", key, min: `${condition}`, max: `${condition}` },
      exact: true,
    };
  }
  const ops = condition as Record<string, unknown>;
  let min = "-inf";
  let max = "+inf";
  for (const [op, operand] of Object.entries(ops)) {
    const numeric = typeof operand === "number" && Number.isFinite(operand);
    switch (op) {
      case "$eq":
        if (!numeric) return null;
        min = `${operand}`;
        max = `${operand}`;
        break;
      case "$gt":
        if (!numeric) return null;
        min = `(${operand}`;
        break;
      case "$gte":
        if (!numeric) return null;
        min = `${operand}`;
        break;
      case "$lt":
        if (!numeric) return null;
        max = `(${operand}`;
        break;
      case "$lte":
        if (!numeric) return null;
        max = `${operand}`;
        break;
      default:
        // $ne / $nin / $exists also match documents the ZSET does not hold —
        // no sound source, and the re-check has to run.
        return null;
    }
  }
  if (min === "-inf" && max === "+inf") return null;
  return { source: { kind: "range", key, min, max }, exact: true };
}

/**
 * Compile a filter into a plan: a base id set, sound index sources to
 * intersect with it, and whether the result still needs an in-process
 * re-check.
 *
 * `$and` branches are flattened (their conditions AND together, so each may
 * contribute sources). A top-level `$or` is planned only when every branch
 * reduces to one exact tag source — otherwise it falls to the re-check.
 *
 * @param filter The neutral filter (already scoped by the service).
 * @param indexes Declared path → index kind.
 * @param keys The collection's key namespace.
 * @returns The plan.
 */
export function planFilter(
  filter: Record<string, unknown>,
  indexes: Map<string, IndexKind>,
  keys: RedisKeys,
): QueryPlan {
  const sources: PlanSource[] = [];
  let base = keys.ids;
  let exact = true;

  const visit = (node: Record<string, unknown>): void => {
    for (const [key, condition] of Object.entries(node)) {
      if (key === "$and") {
        for (const branch of condition as Record<string, unknown>[]) visit(branch);
        continue;
      }
      if (key === "$or") {
        const branches = condition as Record<string, unknown>[];
        const unionKeys: string[] = [];
        const planned = branches.every((branch) => {
          const entries = Object.entries(branch);
          if (entries.length !== 1) return false;
          const [path, cond] = entries[0];
          if (indexes.get(path) !== "tag") return false;
          const source = tagSource(path, cond, keys);
          if (!source || source.source.kind === "range") return false;
          unionKeys.push(
            ...(source.source.kind === "union" ? source.source.keys : source.source.keys),
          );
          return true;
        });
        if (planned && unionKeys.length > 0) sources.push({ kind: "union", keys: unionKeys });
        else exact = false;
        continue;
      }
      // The soft-delete condition is the hottest filter in the system, and the
      // `active` set tracks it exactly — no per-timestamp index keys.
      if (key === DELETED_AT) {
        if (isNullCondition(condition)) {
          base = keys.active;
          continue;
        }
        if (isNotNullCondition(condition)) {
          // "deleted documents" is `ids` minus `active`; there is no sound
          // single source for it, so scan the base and re-check.
          exact = false;
          continue;
        }
        exact = false;
        continue;
      }
      const kind = indexes.get(key);
      const planned = kind === "number"
        ? numberSource(key, condition, keys)
        : kind === "tag"
        ? tagSource(key, condition, keys)
        : null;
      if (planned) {
        sources.push(planned.source);
        if (!planned.exact) exact = false;
      } else {
        exact = false;
      }
    }
  };

  visit(filter);

  // Fold every single-key intersect source into one INTERSECT — one ZINTER
  // instead of N round-trips.
  const intersectKeys = sources
    .filter((s): s is { kind: "intersect"; keys: string[] } => s.kind === "intersect")
    .flatMap((s) => s.keys);
  const rest = sources.filter((s) => s.kind !== "intersect");
  const folded: PlanSource[] = intersectKeys.length > 0
    ? [{ kind: "intersect", keys: intersectKeys }, ...rest]
    : rest;

  return { base, sources: folded, exact, scan: folded.length === 0 };
}
