/**
 * In-process evaluation of the neutral filter grammar — the half of a Redis
 * query the secondary indexes cannot answer.
 *
 * The Mongo/pg/sqlite backends push the whole filter into storage; Redis has
 * no query language, so this module is the equivalent of their compilers: it
 * evaluates a filter against a fetched document with the **same semantics**
 * (absent fields match `$ne`/`$nin`, never satisfy a range; `null` equality
 * matches both a stored null and an absent key; `$exists` inspects key
 * presence). The conformance suite is what keeps it aligned.
 *
 * @module
 */

/** Locale/case options honored by {@link compareValues}. */
export interface CompareOptions {
  /** Fold case before comparing strings (collation strength 1 or 2). */
  caseInsensitive?: boolean;
}

/** Read a dot-path out of a document (`undefined` when any segment is absent). */
export function getPath(doc: unknown, path: string): unknown {
  let node: unknown = doc;
  for (const segment of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * Whether a dot-path's key exists, distinguishing a **stored null** (present)
 * from an absent key — the distinction `$exists` turns on.
 */
export function hasPath(doc: unknown, path: string): boolean {
  const segments = path.split(".");
  let node: unknown = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    if (node === null || typeof node !== "object") return false;
    node = (node as Record<string, unknown>)[segments[i]];
  }
  return node !== null && typeof node === "object" &&
    segments[segments.length - 1] in (node as Record<string, unknown>);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ax = a as Record<string, unknown>;
  const bx = b as Record<string, unknown>;
  const keys = Object.keys(ax);
  if (keys.length !== Object.keys(bx).length) return false;
  return keys.every((k) => k in bx && deepEqual(ax[k], bx[k]));
}

// Equality with Mongo's null rule: `null` matches a stored null AND an absent
// key. Objects and arrays compare as whole values (no element matching), which
// is what the SQL backends' JSONB/JSON1 equality does.
function equals(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (expected !== null && typeof expected === "object") return deepEqual(actual, expected);
  return actual === expected;
}

// Ranges never match an absent field or a stored null — the SQL backends get
// this from three-valued logic, and Mongo from BSON type ordering.
function comparable(actual: unknown): boolean {
  return actual !== undefined && actual !== null;
}

const OPERATORS = new Set([
  "$eq",
  "$ne",
  "$in",
  "$nin",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$exists",
]);

/** Whether a condition object is operator-shaped (`{ $gte: 5 }`) or a value. */
export function isOperatorCondition(condition: unknown): boolean {
  return condition !== null && typeof condition === "object" && !Array.isArray(condition) &&
    Object.keys(condition as object).every((k) => OPERATORS.has(k));
}

function matchCondition(doc: unknown, path: string, condition: unknown): boolean {
  const actual = getPath(doc, path);
  if (!isOperatorCondition(condition)) return equals(actual, condition);

  for (const [op, operand] of Object.entries(condition as Record<string, unknown>)) {
    switch (op) {
      case "$eq":
        if (!equals(actual, operand)) return false;
        break;
      case "$ne":
        if (equals(actual, operand)) return false;
        break;
      case "$in":
        if (!(operand as unknown[]).some((v) => equals(actual, v))) return false;
        break;
      case "$nin":
        if ((operand as unknown[]).some((v) => equals(actual, v))) return false;
        break;
      case "$gt":
        if (!comparable(actual) || !((actual as number) > (operand as number))) return false;
        break;
      case "$gte":
        if (!comparable(actual) || !((actual as number) >= (operand as number))) return false;
        break;
      case "$lt":
        if (!comparable(actual) || !((actual as number) < (operand as number))) return false;
        break;
      case "$lte":
        if (!comparable(actual) || !((actual as number) <= (operand as number))) return false;
        break;
      case "$exists":
        if (hasPath(doc, path) !== !!operand) return false;
        break;
      default:
        throw new Error(`[redis] unsupported filter operator ${op}`);
    }
  }
  return true;
}

/**
 * Evaluate a neutral filter against one document.
 *
 * @param doc The document to test.
 * @param filter The filter (`{}` matches everything).
 * @returns Whether the document matches.
 */
export function matchesFilter(doc: unknown, filter: Record<string, unknown>): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    if (key === "$and") {
      if (!(condition as Record<string, unknown>[]).every((c) => matchesFilter(doc, c))) {
        return false;
      }
      continue;
    }
    if (key === "$or") {
      if (!(condition as Record<string, unknown>[]).some((c) => matchesFilter(doc, c))) {
        return false;
      }
      continue;
    }
    if (!matchCondition(doc, key, condition)) return false;
  }
  return true;
}

/**
 * Order two values for a sort: absent/null first, then numbers and strings by
 * their natural order, with optional case folding for the collation.
 *
 * @param a Left value.
 * @param b Right value.
 * @param options Comparison options (case folding).
 * @returns Negative, zero or positive, as a comparator.
 */
export function compareValues(a: unknown, b: unknown, options: CompareOptions = {}): number {
  const aMissing = a === undefined || a === null;
  const bMissing = b === undefined || b === null;
  if (aMissing || bMissing) return aMissing && bMissing ? 0 : aMissing ? -1 : 1;
  let left = a;
  let right = b;
  if (options.caseInsensitive) {
    if (typeof left === "string") left = left.toLowerCase();
    if (typeof right === "string") right = right.toLowerCase();
  }
  if (left === right) return 0;
  return (left as number) < (right as number) ? -1 : 1;
}

/**
 * Sort documents by a multi-key sort spec (`{ path: 1 | -1 }`), comparing
 * dot-path values with {@link compareValues}. Stable within equal keys.
 *
 * @param docs The documents to sort (sorted in place).
 * @param sort Sort spec: dot-path → 1 ascending, -1 descending.
 * @param options Comparison options (case folding for a collation).
 * @returns The same array, sorted.
 */
export function sortDocuments<T>(
  docs: T[],
  sort: Record<string, 1 | -1>,
  options: CompareOptions = {},
): T[] {
  const terms = Object.entries(sort);
  if (terms.length === 0) return docs;
  return docs.sort((a, b) => {
    for (const [path, direction] of terms) {
      const cmp = compareValues(getPath(a, path), getPath(b, path), options);
      if (cmp !== 0) return direction === -1 ? -cmp : cmp;
    }
    return 0;
  });
}
