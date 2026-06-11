/**
 * Telemetry adapter contract for instrumenting service-layer operations with
 * spans. Concrete adapters (e.g. OpenTelemetry) live under `./adapters`.
 *
 * @module
 */
export type { TelemetryAdapter, TelemetryOptions } from "./telemetry.interface.ts";
