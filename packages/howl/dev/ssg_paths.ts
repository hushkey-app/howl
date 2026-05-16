import type { StaticPathParams } from "../core/types.ts";

const PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/g;
const HAS_PARAM_RE = /:([A-Za-z_][A-Za-z0-9_]*)/;

export function hasDynamicParams(pattern: string): boolean {
  return HAS_PARAM_RE.test(pattern);
}

export function getPathParamNames(pattern: string): string[] {
  return Array.from(pattern.matchAll(PARAM_RE)).map((m) => m[1]);
}

/**
 * Convert a dynamic URL pattern like `/properties/:id` to a concrete pathname
 * using one param tuple from `getStaticPaths`.
 *
 * Notes:
 * - Optional-group patterns (`{/:id}?`) are not materialised yet.
 * - Wildcard patterns are not materialised yet.
 */
export function materializeSsgPathname(
  pattern: string,
  params: StaticPathParams,
): string | null {
  if (pattern.includes("{") || pattern.includes("}") || pattern.includes("*")) {
    return null;
  }

  const names = getPathParamNames(pattern);
  if (names.length === 0) return pattern;

  let pathname = pattern;
  for (const name of names) {
    const raw = params[name];
    if (raw === undefined || raw === null) return null;
    pathname = pathname.replaceAll(`:${name}`, encodeURIComponent(String(raw)));
  }

  return pathname;
}
