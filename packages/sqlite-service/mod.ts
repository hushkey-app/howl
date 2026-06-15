/**
 * `@hushkey/sqlite-service` — the SQLite backend for the hushkey
 * document-store service layer, built for Deno's native `node:sqlite`.
 *
 * The zero-infra rung of the storage ladder: no dependencies, no WASM, no
 * server — and it works under `deno compile`, so a full-stack app with
 * embedded storage ships as a single binary. {@link SqliteService} wires the
 * {@link SqliteBackend} into the core `DocumentService` contract from
 * `@hushkey/service-core`; the same service code moves up to
 * `@hushkey/pg-service` or `@hushkey/mongo-service` unchanged.
 *
 * Storage follows the same hybrid as the Postgres backend: one JSON document
 * per row plus typed `GENERATED ALWAYS … VIRTUAL` columns for promoted paths,
 * ensured idempotently at construction — no migration framework. The neutral
 * filter grammar compiles to parametrized SQL; anything richer goes through
 * the `.sqlite()` escape hatch.
 *
 * The full `@hushkey/service-core` surface is re-exported so consumers can
 * use a single import for the service, the filter grammar, schemas, and
 * adapters.
 *
 * @module
 */
export { SqliteService } from "./sqlite.service.class.ts";
export type { SqliteServiceOptions } from "./sqlite.service.class.ts";
export { SqliteBackend } from "./sqlite.backend.ts";
export type {
  PromoteSpec,
  SqliteBackendOptions,
  SqliteDbLike,
  SqliteStatementLike,
} from "./sqlite.backend.ts";
export { assertIdent, compileWhere, jsonPath } from "./filter.compiler.ts";
export type { CompiledWhere, PromotedColumn, PromotedType } from "./filter.compiler.ts";
export * from "@hushkey/service-core";
