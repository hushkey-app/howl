/**
 * Neutral query-shaping options shared by every backend: field projection,
 * locale/case-aware collation, and index hints — the Compass "options" set
 * that sits next to the filter grammar.
 *
 * Projection is Mongo-shaped (`{ path: 1 }` include / `{ path: 0 }` exclude,
 * dot-paths into sub-documents). Document stores pass it to storage; SQL
 * backends keep documents in one JSON value, so they shape the rows after the
 * fetch with {@link applyProjection} — same semantics, no per-backend drift.
 *
 * @module
 */

/**
 * A Mongo-style projection: dot-path → `1` (include) or `0` (exclude).
 *
 * Include and exclude modes cannot be mixed in one projection (the `id` key is
 * the exception — it may be excluded from an include projection). `id` is kept
 * unless it is explicitly excluded with `{ id: 0 }`.
 */
export type Projection = Record<string, 0 | 1>;

/**
 * Locale/case-aware comparison for sorts, mirroring Mongo's collation option.
 *
 * Backend support differs and is advertised through
 * {@link FindCapabilities.collation}: Mongo applies it natively; the SQL
 * backends implement the case-folding half of `strength` (1 or 2 → sort
 * case-insensitively, comparing values as text) and otherwise order with the
 * storage's own collation.
 */
export interface Collation {
  /** ICU locale (e.g. `"en"`, `"de@collation=phonebook"`, `"simple"`). */
  locale: string;
  /**
   * Comparison strength: 1 (base characters), 2 (+ accents), 3 (+ case, the
   * default). 1 and 2 are the case-insensitive levels.
   */
  strength?: 1 | 2 | 3;
}

/**
 * An index hint: an index name, or a key pattern for backends that accept one
 * (Mongo). Advisory — see {@link FindCapabilities.hint} for support.
 */
export type IndexHint = string | Record<string, 1 | -1>;

/** How a backend honors one optional find option. */
export type FindSupport =
  /** Passed to storage and honored exactly. */
  | "native"
  /** Honored, but implemented above storage or as a documented subset. */
  | "approximate"
  /** Accepted and ignored — the store has no equivalent. */
  | "none";

/**
 * What a backend does with each optional find option, so callers (and the
 * studio UI) can tell a native guarantee from an approximation instead of
 * guessing from the backend's name.
 */
export interface FindCapabilities {
  /** Field projection (`project` / the legacy `select`). */
  project: FindSupport;
  /** Sorting (`sort`). */
  sort: FindSupport;
  /** Locale/case-aware comparison (`collation`). */
  collation: FindSupport;
  /** Index hint (`hint`). */
  hint: FindSupport;
}

/** The assumption for a backend that advertises nothing: everything native. */
export const DEFAULT_FIND_CAPABILITIES: FindCapabilities = {
  project: "native",
  sort: "native",
  collation: "native",
  hint: "native",
};

/**
 * Fold the legacy `select` list into a {@link Projection} and validate it.
 * Returns `undefined` when neither is set, so backends can skip the work.
 *
 * @param project A Mongo-style projection.
 * @param select Legacy include-only field list (`project` wins when both set).
 * @returns The normalized projection, or `undefined`.
 * @throws When include and exclude keys are mixed (`id` excepted).
 */
export function normalizeProjection(
  project?: Projection,
  select?: string[],
): Projection | undefined {
  if (project && Object.keys(project).length > 0) {
    let includes = 0;
    let excludes = 0;
    for (const [path, value] of Object.entries(project)) {
      if (value !== 0 && value !== 1) {
        throw new Error(`projection value for "${path}" must be 0 or 1`);
      }
      if (path === "id") continue;
      if (value === 1) includes++;
      else excludes++;
    }
    if (includes > 0 && excludes > 0) {
      throw new Error(
        "projection cannot mix included and excluded fields (except id)",
      );
    }
    return project;
  }
  if (select && select.length > 0) {
    return Object.fromEntries(select.map((field) => [field, 1])) as Projection;
  }
  return undefined;
}

/** Whether a normalized projection includes fields (vs. excluding them). */
function isInclude(projection: Projection): boolean {
  for (const [path, value] of Object.entries(projection)) {
    if (path === "id") continue;
    return value === 1;
  }
  // Only `id` present: `{ id: 0 }` excludes, `{ id: 1 }` includes.
  return projection.id === 1;
}

function getPath(doc: Record<string, unknown>, segments: string[]): unknown {
  let node: unknown = doc;
  for (const segment of segments) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

function setPath(
  target: Record<string, unknown>,
  segments: string[],
  value: unknown,
): void {
  let node = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = node[segments[i]];
    node = (next && typeof next === "object" && !Array.isArray(next)
      ? next
      : (node[segments[i]] = {})) as Record<string, unknown>;
  }
  node[segments[segments.length - 1]] = value;
}

function deletePath(
  target: Record<string, unknown>,
  segments: string[],
): void {
  let node: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const next = node[segments[i]];
    if (!next || typeof next !== "object" || Array.isArray(next)) return;
    node = next as Record<string, unknown>;
  }
  delete node[segments[segments.length - 1]];
}

/**
 * Shape one already-fetched document by a projection — the SQL backends' side
 * of {@link Projection}, matching what a document store returns for the same
 * spec: include mode keeps only the listed paths (plus `id`), exclude mode
 * removes them, and dot-paths reach into sub-documents.
 *
 * @param doc The fetched document (not mutated).
 * @param projection A normalized projection from {@link normalizeProjection}.
 * @returns The projected document.
 */
export function applyProjection<T>(doc: T, projection: Projection): T {
  const source = doc as unknown as Record<string, unknown>;
  const include = isInclude(projection);

  if (!include) {
    const out = structuredClone(source);
    for (const [path, value] of Object.entries(projection)) {
      if (value === 0) deletePath(out, path.split("."));
    }
    return out as unknown as T;
  }

  const out: Record<string, unknown> = {};
  // `id` rides along unless it is explicitly excluded, as in Mongo (`_id`).
  if (projection.id !== 0 && "id" in source) out.id = source.id;
  for (const [path, value] of Object.entries(projection)) {
    if (value !== 1 || path === "id") continue;
    const segments = path.split(".");
    const picked = getPath(source, segments);
    if (picked === undefined) continue;
    setPath(out, segments, structuredClone(picked));
  }
  return out as unknown as T;
}
