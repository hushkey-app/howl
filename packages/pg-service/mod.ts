/**
 * `@hushkey/pg-service` — the Postgres backend for the hushkey document-store
 * service layer.
 *
 * {@link PgService} wires the {@link PgBackend} into the core
 * `DocumentService` contract from `@hushkey/service-core`. Storage is the
 * HANDOFF §6 hybrid: one JSONB document per row plus typed
 * `GENERATED ALWAYS … STORED` columns for promoted paths — real B-tree
 * indexes and planner statistics where they matter, no migration framework
 * (only the `promote` list changes DDL, ensured idempotently at
 * construction). The neutral filter grammar compiles to parametrized SQL;
 * anything richer goes through the `.sql()` escape hatch.
 *
 * The full `@hushkey/service-core` surface is re-exported so consumers can
 * use a single import for the service, the filter grammar, schemas, and
 * adapters.
 *
 * @module
 */
export { PgService } from "./pg.service.class.ts";
export type { PgServiceOptions } from "./pg.service.class.ts";
export { PgBackend } from "./pg.backend.ts";
export type { PgBackendOptions, PgClientLike, PromoteSpec } from "./pg.backend.ts";
export { assertIdent, compileWhere } from "./filter.compiler.ts";
export type { CompiledWhere, PromotedColumn, PromotedType } from "./filter.compiler.ts";
export * from "@hushkey/service-core";
