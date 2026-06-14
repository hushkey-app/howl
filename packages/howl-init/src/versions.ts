import denoJson from "../deno.json" with { type: "json" };

/**
 * Version range for the `@hushkey/howl`, `@hushkey/howl-react`, and
 * `@hushkey/howl-vue` packages — kept in lockstep with this package, so we
 * read it from our own `deno.json` (bumped together by the release script).
 */
export const HOWL_VERSION: string = denoJson.version;

/**
 * Version range for the service-layer packages (`@hushkey/service-core`,
 * `@hushkey/{sqlite,pg,mongo}-service`, `@hushkey/studio`). These ship on a
 * separate version line from the framework, so they are pinned here.
 */
export const SERVICE_VERSION = "0.1.0";
