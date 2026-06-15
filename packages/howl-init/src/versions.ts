import denoJson from "../deno.json" with { type: "json" };

/**
 * Shared version range for every `@hushkey/*` package the scaffolder pins
 * (`howl`, `howl-react`, `howl-vue`, `service-core`, the `*-service` backends,
 * and `studio`). All packages ship on one unified version line — bumped
 * together by `scripts/version.ts` — so we read it from our own `deno.json`.
 */
export const HOWL_VERSION: string = denoJson.version;
