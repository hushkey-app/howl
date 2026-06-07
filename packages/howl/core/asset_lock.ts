import { ASSET_CACHE_BUST_KEY } from "./constants.ts";

/**
 * Create a "locked" asset path — version-specific so it can be served with a
 * very long cache lifetime (1 year). Neutral string helper used by the build's
 * CSS/asset pipeline.
 */
export function assetInternal(path: string, buildId: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  try {
    const url = new URL(path, "https://howlassetcache.local");
    if (
      url.protocol !== "https:" || url.host !== "howlassetcache.local" ||
      url.searchParams.has(ASSET_CACHE_BUST_KEY)
    ) {
      return path;
    }
    url.searchParams.set(ASSET_CACHE_BUST_KEY, buildId);
    return url.pathname + url.search + url.hash;
  } catch (err) {
    // deno-lint-ignore no-console
    console.warn(
      `Failed to create asset() URL, falling back to regular path ('${path}'):`,
      err,
    );
    return path;
  }
}

/** Apply {@linkcode assetInternal} to every URL in a `srcset` attribute. */
export function assetSrcSetInternal(srcset: string, buildId: string): string {
  if (srcset.includes("(")) return srcset;
  const parts = srcset.split(",");
  const constructed = [];
  for (const part of parts) {
    const trimmed = part.trimStart();
    const leadingWhitespace = part.length - trimmed.length;
    if (trimmed === "") return srcset;
    let urlEnd = trimmed.indexOf(" ");
    if (urlEnd === -1) urlEnd = trimmed.length;
    const leading = part.substring(0, leadingWhitespace);
    const url = trimmed.substring(0, urlEnd);
    const trailing = trimmed.substring(urlEnd);
    constructed.push(leading + assetInternal(url, buildId) + trailing);
  }
  return constructed.join(",");
}
