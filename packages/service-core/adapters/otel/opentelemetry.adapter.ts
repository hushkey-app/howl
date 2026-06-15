import type { TelemetryAdapter } from "../../telemetry/telemetry.interface.ts";

/**
 * OpenTelemetry adapter for Deno
 *
 * Uses Deno's built-in OpenTelemetry API to track database operations
 */
export class OpenTelemetryAdapter implements TelemetryAdapter {
  private span: any; // Deno OpenTelemetry Span
  // OTel `db.system` semconv value ('mongodb', 'postgresql', 'mysql', …).
  // Also prefixes span names: `<dbSystem>.<operation>`. The adapter is
  // storage-agnostic — only the service wiring knows the backend.
  private readonly dbSystem: string;

  /**
   * Create an adapter that parents every operation span under a given span.
   *
   * @param span A parent OpenTelemetry span whose `tracer` is used to create
   *   child spans.
   * @param dbSystem The `db.system` semconv value and span-name prefix
   *   (`mongodb`, `postgresql`, …).
   */
  constructor(span: any, dbSystem = "mongodb") {
    if (!span) {
      throw new Error("OpenTelemetry span is required");
    }
    this.span = span;
    this.dbSystem = dbSystem;
  }

  /**
   * Start a child span named `<dbSystem>.<operation>` with standard `db.*`
   * attributes. Returns null if no tracer is available or creation throws.
   *
   * @param operation The operation name (e.g. `CREATE`, `FIND`).
   * @param table The collection/table name (`db.name`).
   * @param attributes Extra span attributes.
   * @returns The child span, or null.
   */
  startSpan(
    operation: string,
    table: string,
    attributes?: Record<string, string | number | boolean>,
  ): any | null {
    // Use the parent span's tracer to create a child span
    try {
      const tracer = this.span?.tracer;
      if (!tracer) {
        return null;
      }

      const spanName = `${this.dbSystem}.${operation.toLowerCase()}`;
      const spanAttributes = {
        "db.system": this.dbSystem,
        "db.name": table,
        "db.operation": operation,
        ...attributes,
      };

      // Try to create a child span using the parent span's context
      let childSpan;
      if (this.span && typeof this.span.spanContext === "function") {
        // If span has spanContext method, use it
        childSpan = tracer.startSpan(spanName, {
          parent: this.span.spanContext(),
          attributes: spanAttributes,
        });
      } else {
        // Fallback: create span with parent span directly
        childSpan = tracer.startSpan(spanName, {
          parent: this.span,
          attributes: spanAttributes,
        });
      }

      return childSpan;
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=telemetry SDK unavailable; non-blocking instrumentation must not break callers
      return null;
    }
  }

  /**
   * Finalize a span: apply attributes, set OK/ERROR status (recording the
   * exception on failure), and end it. No-op for a null span.
   *
   * @param span The span from {@link startSpan}.
   * @param success Whether the operation succeeded.
   * @param error The error to record when `success` is false.
   * @param attributes Final attributes to set before ending.
   */
  endSpan(
    span: any | null,
    success: boolean,
    error?: Error | string,
    attributes?: Record<string, string | number | boolean>,
  ): void {
    if (!span) {
      return;
    }

    try {
      // Add final attributes
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          span.setAttribute(key, value);
        }
      }

      // Set status
      if (success) {
        span.setStatus({ code: 1 }); // OK
      } else {
        span.setStatus({
          code: 2, // ERROR
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) {
          span.recordException(error);
        }
      }

      span.end();
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=telemetry SDK unavailable; non-blocking instrumentation must not break callers
    }
  }

  /**
   * Add a named event to a span. No-op for a null span.
   *
   * @param span The target span.
   * @param name The event name.
   * @param attributes Event attributes.
   */
  addEvent(
    span: any | null,
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): void {
    if (!span) {
      return;
    }

    try {
      span.addEvent(name, attributes);
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=telemetry SDK unavailable; non-blocking instrumentation must not break callers
    }
  }

  /**
   * Set a single attribute on a span. No-op for a null span.
   *
   * @param span The target span.
   * @param key The attribute key.
   * @param value The attribute value.
   */
  setAttribute(
    span: any | null,
    key: string,
    value: string | number | boolean,
  ): void {
    if (!span) {
      return;
    }

    try {
      span.setAttribute(key, value);
    } catch (_error) {
      //@silent-catch decided=2026-05-21 reason=telemetry SDK unavailable; non-blocking instrumentation must not break callers
    }
  }
}
