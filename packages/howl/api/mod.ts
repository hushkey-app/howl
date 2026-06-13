/**
 * @module
 *
 * Typed API layer entrypoint for `@hushkey/howl/api`. Exports
 * {@linkcode defineConfig} (the recommended pre-typed factory) and the
 * generic {@linkcode defineApi} helper, the {@linkcode apiHandler}
 * registrar, OpenAPI generation ({@linkcode getApiSpecs},
 * {@linkcode generateOpenApiSpec}), the cache-adapter family
 * ({@linkcode memoryCache}, {@linkcode redisCache}, {@linkcode kvCache},
 * {@linkcode tryCache}), and the public type surface for API definitions
 * — {@linkcode ApiDefinition}, {@linkcode HowlApiConfig},
 * {@linkcode CacheAdapter}, {@linkcode RateLimitConfig}, etc.
 */

// =============================================================================
// @hushkey/howl/api
// =============================================================================

export { defineApi, defineConfig } from "./define-api.ts";
export { apiHandler } from "./api-handler.ts";
export { getApiSpecs } from "./api-specs.ts";
export { generateOpenApiSpec } from "./generate-openapi.ts";
export { default as errors, HttpError } from "./errors.ts";
export { memoryCache } from "./cache/memory.ts";
export { redisCache, type RedisLike } from "./cache/redis.ts";
export { tryCache } from "./cache/tiered.ts";
export { kvCache } from "./cache/kv.ts";
export type {
  AnyApiDefinition,
  ApiAfterHook,
  ApiBeforeHook,
  ApiDefinition,
  CacheAdapter,
  ContextWithBody,
  HowlApiConfig,
  RateLimitConfig,
  RequestBodySchema,
  ResponseReturnType,
  ResponsesMap,
} from "./types.ts";
