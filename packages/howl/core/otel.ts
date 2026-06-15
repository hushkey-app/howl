import { type Span, SpanStatusCode, trace } from "@opentelemetry/api";
import denoJson from "../deno.json" with { type: "json" };

export const CURRENT_HOWL_VERSION = denoJson.version;

export const tracer = trace.getTracer("howl", CURRENT_HOWL_VERSION);
export { trace };

export function recordSpanError(span: Span, err: unknown) {
  if (err instanceof Error) {
    span.recordException(err);
  } else {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: String(err),
    });
  }
}

const INVALID_TRACE_ID = "00000000000000000000000000000000";
let tracingActive: boolean | null = null;

/**
 * Whether a real OpenTelemetry tracer provider is registered. With the default
 * no-op provider every span is dead weight on the request hot path, so callers
 * skip span creation entirely. Probed lazily on first request (providers
 * register at startup, after this module loads) and memoized — a no-op span
 * carries the invalid all-zero trace id regardless of sampling.
 */
export function isTracingActive(): boolean {
  if (tracingActive === null) {
    const probe = tracer.startSpan("howl.tracing.probe");
    tracingActive = probe.spanContext().traceId !== INVALID_TRACE_ID;
    probe.end();
  }
  return tracingActive;
}
