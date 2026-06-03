/**
 * Public asset-locking helpers. An asset path run through {@linkcode asset} is
 * version-specific (carries the current `BUILD_ID`), so the static middleware
 * can serve it with a one-year `immutable` cache lifetime — a new build rotates
 * the id and busts the cache automatically.
 *
 * Server-only (reads `BUILD_ID`); call from render engines / SSR, not client
 * bundles.
 *
 * @module
 */
import { BUILD_ID } from "../utils/build-id.ts";
import { assetInternal, assetSrcSetInternal } from "./asset_lock.ts";

/**
 * Create a "locked" asset path — version-specific (current `BUILD_ID`) so it can
 * be served with a very long, `immutable` cache lifetime.
 */
export function asset(path: string): string {
  return assetInternal(path, BUILD_ID);
}

/** Apply {@linkcode asset} to every URL in a `srcset` attribute value. */
export function assetSrcSet(srcset: string): string {
  return assetSrcSetInternal(srcset, BUILD_ID);
}
