import { z } from "zod";

/**
 * Audit + soft-delete envelope stamped on every stored document. All
 * timestamps are epoch milliseconds; the `deleted_*` pair is null while the
 * document is active. This is the contract the service layer enforces — it
 * must ship with the package, never be re-declared per consumer.
 *
 * The service always stamps `created_by`/`updated_by` (defaulting to
 * `"system"`), but the schema tolerates null for legacy documents written
 * before the service layer — matches the deployed hushkey contract
 * (`packages/shared/schemas/meta.extension.schema.ts`).
 */
export interface Meta {
  /** Creation time (epoch ms). */
  created_at: number;
  /** `executionerId` that created the document (null only on legacy docs). */
  created_by: string | null;
  /** Last update time (epoch ms). */
  updated_at: number;
  /** `executionerId` of the last writer (null only on legacy docs). */
  updated_by: string | null;
  /** Soft-delete time (epoch ms); null while the document is active. */
  deleted_at: number | null;
  /** `executionerId` that soft-deleted the document; null while active. */
  deleted_by: string | null;
}

/**
 * Zod schema for the {@link Meta} envelope. Consumers compose this into their
 * collection schema (directly or via {@link documentSchema}); the service
 * layer validates the full merged document against it on every write.
 */
export const metaSchema: z.ZodType<Meta> = z.object({
  created_at: z.number().describe("The creation date for the item"),
  created_by: z.string().nullable().describe("Who created the item"),
  updated_at: z.number().describe("The update date for the item"),
  updated_by: z.string().nullable().describe("Who last updated the item"),
  deleted_at: z.number().nullable().describe("The deletion date for the item"),
  deleted_by: z.string().nullable().describe("Who deleted the item"),
}).describe("The meta for the item");

/**
 * Wrap a collection's field shape in the standard stored-document envelope:
 * a string `id`, an integer `version` (optimistic lock), and {@link metaSchema}.
 * The backend stores its native key as the source of `id` and never persists
 * `id` itself — this schema describes the validated/returned shape, not
 * storage.
 *
 * @param shape The collection-specific zod field shape.
 * @returns A zod object schema for the full stored document.
 */
export function documentSchema<Shape extends z.ZodRawShape>(
  shape: Shape,
): z.ZodObject<
  Shape & {
    id: z.ZodString;
    version: z.ZodNumber;
    meta: z.ZodType<Meta>;
  }
> {
  return z.object({
    ...shape,
    id: z.string(),
    version: z.number().int(),
    meta: metaSchema,
  });
}
