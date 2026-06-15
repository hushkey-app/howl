/**
 * The neutral filter grammar for the hushkey document-store service layer.
 *
 * This is the empirically-used subset of Mongo's query language — backends
 * either pass it through (Mongo) or compile it (SQL → JSONB/JSON1 predicates).
 * Deliberately small: `$regex`, `$elemMatch`, aggregations, array update
 * operators and text search are out of scope. Queries that need more go
 * through a backend escape hatch, explicitly uncached.
 *
 * @module
 */

/**
 * Comparison operators allowed on a single field. The value type `V` is the
 * field's declared type; `$in`/`$nin` take arrays of it.
 */
export interface FilterOperators<V> {
  /** Matches values equal to the given value. */
  $eq?: V;
  /** Matches values not equal to the given value. */
  $ne?: V;
  /** Matches when the field's value is in the given array. */
  $in?: V[];
  /** Matches when the field's value is not in the given array. */
  $nin?: V[];
  /** Matches values greater than the given value. */
  $gt?: V;
  /** Matches values greater than or equal to the given value. */
  $gte?: V;
  /** Matches values less than the given value. */
  $lt?: V;
  /** Matches values less than or equal to the given value. */
  $lte?: V;
  /** Matches by field presence (true) or absence (false). */
  $exists?: boolean;
}

/**
 * A single field condition: either a bare value (equality) or an operator
 * object.
 */
export type Condition<V> = V | FilterOperators<V>;

/**
 * A query filter over a document shape `T`: typed conditions on declared
 * fields, `$or`/`$and` branches, and dot-path keys (`"meta.deleted_at"`) into
 * nested documents.
 */
export type Filter<T> =
  & { [P in keyof T & string]?: Condition<T[P]> }
  & {
    /** Matches when at least one branch matches. */
    $or?: Filter<T>[];
    /** Matches when every branch matches. */
    $and?: Filter<T>[];
  }
  & {
    /** Dot-path conditions into nested documents (e.g. `"meta.deleted_at"`). */
    [path: `${string}.${string}`]: unknown;
  };
