/**
 * `@hushkey/mongo-service` — the MongoDB backend for the hushkey document-store
 * service layer.
 *
 * {@link MongoService} wires the Mongo {@link MongoBackend} into the core
 * `DocumentService` contract from `@hushkey/service-core`: string ids (no
 * `ObjectId` ever leaks), the audit/soft-delete meta envelope, soft delete by
 * default, optimistic locking, versioned cache invalidation, and telemetry.
 * Mongo-only extras: `transaction()` and the `.mongo()` escape hatch.
 *
 * The full `@hushkey/service-core` surface is re-exported so consumers can
 * use a single import for the service, the filter grammar, schemas, and
 * adapters.
 *
 * @module
 */
export { MongoService } from "./mongo.service.class.ts";
export type { MongoServiceOptions, PublicFilter } from "./mongo.service.class.ts";
export { MongoBackend } from "./mongo.backend.ts";
export type { MongoBackendOptions } from "./mongo.backend.ts";
export * from "@hushkey/service-core";
