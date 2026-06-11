/**
 * Structural schema contract for write-boundary validation.
 *
 * The service layer only needs `safeParseAsync` — accepting any object that
 * provides it (zod 3, zod 4, or hand-rolled) keeps the package free of a hard
 * zod version pin in its public types. Zod object schemas satisfy this
 * interface structurally.
 *
 * @module
 */

/** A single validation issue inside a {@link SchemaError}. */
export interface SchemaIssue {
  /** Path to the offending field, joined with dots for display. */
  path: PropertyKey[];
  /** Human-readable description of the failure. */
  message: string;
  /** Machine-readable issue code, when the validator provides one. */
  code?: string;
}

/** The error half of a safe-parse result. */
export interface SchemaError {
  /** Every issue found during validation. */
  issues: SchemaIssue[];
}

/** The result of {@link SchemaLike.safeParseAsync}. */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: SchemaError };

/**
 * The structural validator interface the service layer requires. The full
 * merged document is parsed on every create/patch; validators that strip
 * unknown keys (zod's default) define the silently-dropped-fields behavior of
 * the contract.
 */
export interface SchemaLike<T> {
  /** Validate a candidate document without throwing. */
  safeParseAsync(data: unknown): Promise<SafeParseResult<T>>;
}
