/**
 * Telemetry adapter interface for performance tracking
 *
 * Implementations can use OpenTelemetry, custom metrics, or any telemetry solution
 */
export interface TelemetryAdapter {
  /**
   * Start a span for an operation
   * @param operation - Operation name (e.g., 'CREATE', 'FIND', 'PATCH')
   * @param table - Table name
   * @param attributes - Additional attributes to add to the span
   * @returns Span instance or null if telemetry is disabled
   */
  startSpan(
    operation: string,
    table: string,
    attributes?: Record<string, string | number | boolean>,
  ): any | null;

  /**
   * End a span and record its duration
   * @param span - Span instance returned from startSpan
   * @param success - Whether the operation succeeded
   * @param error - Error if operation failed
   * @param attributes - Additional attributes to add before ending
   */
  endSpan(
    span: any | null,
    success: boolean,
    error?: Error | string,
    attributes?: Record<string, string | number | boolean>,
  ): void;

  /**
   * Add an event to the current span
   * @param span - Span instance
   * @param name - Event name
   * @param attributes - Event attributes
   */
  addEvent(
    span: any | null,
    name: string,
    attributes?: Record<string, string | number | boolean>,
  ): void;

  /**
   * Set an attribute on the span
   * @param span - Span instance
   * @param key - Attribute key
   * @param value - Attribute value
   */
  setAttribute(
    span: any | null,
    key: string,
    value: string | number | boolean,
  ): void;
}

/**
 * Telemetry configuration options
 */
export interface TelemetryOptions {
  /** Enable telemetry (default: false - opt-in only) */
  enabled?: boolean;
  /** Custom telemetry adapter (required if enabled) */
  adapter?: TelemetryAdapter;
}
