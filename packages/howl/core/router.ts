export type Method =
  | "HEAD"
  | "GET"
  | "POST"
  | "PATCH"
  | "PUT"
  | "DELETE"
  | "OPTIONS";

export type RouteByMethod<T> = {
  [m in Method]: T | null;
};

export interface StaticRouteDef<T> {
  pattern: string | URLPattern;
  byMethod: RouteByMethod<T>;
}

export interface DynamicRouteDef<T> {
  pattern: URLPattern;
  byMethod: RouteByMethod<T>;
}

function newByMethod<T>(): RouteByMethod<T> {
  return {
    GET: null,
    POST: null,
    PATCH: null,
    DELETE: null,
    PUT: null,
    HEAD: null,
    OPTIONS: null,
  };
}

export interface RouteResult<T> {
  params: Record<string, string>;
  item: T | null;
  methodMatch: boolean;
  pattern: string | null;
}

export interface Router<T> {
  add(
    method: Method,
    pathname: string,
    item: T,
  ): void;
  match(method: Method, url: URL): RouteResult<T>;
  getAllowedMethods(pattern: string): string[];
  allowedMethodsForUrl(url: URL): string[];
}

export const IS_PATTERN = /[*:{}+?()]/;

const EMPTY: string[] = [];

export class UrlPatternRouter<T> implements Router<T> {
  #statics = new Map<string, StaticRouteDef<T>>();
  #dynamics = new Map<string, DynamicRouteDef<T>>();
  #dynamicArr: DynamicRouteDef<T>[] = [];
  #allowed = new Map<string, Set<string>>();

  getAllowedMethods(pattern: string): string[] {
    const allowed = this.#allowed.get(pattern);
    if (allowed === undefined) return EMPTY;
    return Array.from(allowed);
  }

  /**
   * Collect every HTTP method reachable at `url`, for building an `Allow`
   * header on OPTIONS/405 responses. Mirrors `match()`'s resolution: a static
   * slot shadows dynamics, so when one matches its verbs are returned alone;
   * otherwise the verbs of every overlapping dynamic pattern are unioned —
   * slots shared under different param names (`/x/:id` vs `/x/:projectId`) each
   * contribute their methods, so OPTIONS reports the full set, not just the
   * first matched pattern's.
   */
  allowedMethodsForUrl(url: URL): string[] {
    let pathname = url.pathname;
    let staticMatch = this.#statics.get(pathname);
    if (staticMatch === undefined && pathname !== "/") {
      const alt = pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname + "/";
      const altMatch = this.#statics.get(alt);
      if (altMatch !== undefined) {
        staticMatch = altMatch;
        pathname = alt;
      }
    }
    if (staticMatch !== undefined) {
      return this.getAllowedMethods(pathname);
    }

    const methods = new Set<string>();
    const pathnameInput = { pathname: url.pathname };
    for (let i = 0; i < this.#dynamicArr.length; i++) {
      const route = this.#dynamicArr[i];
      if (route.pattern.exec(pathnameInput) === null) continue;
      const allowed = this.#allowed.get(route.pattern.pathname);
      if (allowed !== undefined) {
        for (const m of allowed) methods.add(m);
      }
    }
    return Array.from(methods);
  }

  add(
    method: Method,
    pathname: string,
    item: T,
  ) {
    let allowed = this.#allowed.get(pathname);
    if (allowed === undefined) {
      allowed = new Set();
      this.#allowed.set(pathname, allowed);
    }

    allowed.add(method);

    let byMethod: RouteByMethod<T>;
    if (IS_PATTERN.test(pathname)) {
      let def = this.#dynamics.get(pathname);
      if (def === undefined) {
        def = {
          pattern: new URLPattern({ pathname }),
          byMethod: newByMethod(),
        };
        this.#dynamics.set(pathname, def);
        this.#dynamicArr.push(def);
      }

      byMethod = def.byMethod;
    } else {
      let def = this.#statics.get(pathname);
      if (def === undefined) {
        def = {
          pattern: pathname,
          byMethod: newByMethod(),
        };
        this.#statics.set(pathname, def);
      }

      byMethod = def.byMethod;
    }

    if (byMethod[method] === null) {
      byMethod[method] = item;
    }
  }

  match(method: Method, url: URL): RouteResult<T> {
    const result: RouteResult<T> = {
      params: Object.create(null),
      item: null,
      methodMatch: false,
      pattern: null,
    };

    let pathname = url.pathname;
    let staticMatch = this.#statics.get(pathname);

    // Trailing-slash fallback: if `/foo` was registered but the request is
    // `/foo/` (or vice versa), try the alternate form before falling through
    // to dynamic patterns. This stops `trailingSlashes("always")` style
    // setups from 404'ing requests aimed at routes registered without the
    // slash. The root path is exempt — it has no alternate form.
    if (staticMatch === undefined && pathname !== "/") {
      const alt = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname + "/";
      const altMatch = this.#statics.get(alt);
      if (altMatch !== undefined) {
        staticMatch = altMatch;
        pathname = alt;
      }
    }

    if (staticMatch !== undefined) {
      result.pattern = pathname;

      let item = staticMatch.byMethod[method];
      if (method === "HEAD" && item === null) {
        item = staticMatch.byMethod.GET;
      }
      if (item !== null) {
        result.methodMatch = true;
        result.item = item;
      }

      return result;
    }

    // Match on the pathname only: passing the full `URL` makes URLPattern
    // coerce and match all 8 URL components per pattern, but every pattern
    // here was registered with `{ pathname }` (the rest are wildcards).
    const pathnameInput = { pathname: url.pathname };
    // The first pattern that matched the path but not the method. Retained so
    // that, if no overlapping pattern serves the method either, the caller can
    // still emit 405 / an OPTIONS Allow header (vs a misleading 404).
    let fallbackPattern: string | null = null;
    for (let i = 0; i < this.#dynamicArr.length; i++) {
      const route = this.#dynamicArr[i];

      const match = route.pattern.exec(pathnameInput);
      if (match === null) continue;

      let item = route.byMethod[method];
      if (method === "HEAD" && item === null) {
        item = route.byMethod.GET;
      }

      if (item !== null) {
        // Matches the path AND serves the method — this is the route.
        result.pattern = route.pattern.pathname;
        result.methodMatch = true;
        result.item = item;

        // Decode matched params
        for (const [key, value] of Object.entries(match.pathname.groups)) {
          result.params[key] = value === undefined ? "" : decodeURI(value);
        }
        return result;
      }

      // Path matched but this def doesn't serve the method. Two routes can
      // share a URL slot under different param names (e.g. `/x/:id` [GET] and
      // `/x/:projectId` [POST]); a later def may serve the method, so keep
      // scanning instead of breaking. Remember the first such match for 405.
      if (fallbackPattern === null) {
        fallbackPattern = route.pattern.pathname;
      }
    }

    if (fallbackPattern !== null) {
      result.pattern = fallbackPattern; // methodMatch stays false ⇒ caller → 405
    }

    return result;
  }
}

/**
 * Transform a filesystem URL path to a `path-to-regex` style matcher.
 */
export function pathToPattern(
  path: string,
  options?: { keepGroups: boolean },
): string {
  const parts = path.split("/");
  if (parts[parts.length - 1] === "index") {
    if (parts.length === 1) {
      return "/";
    }
    parts.pop();
  }

  let route = "";
  // Track segments that contribute a required `/` to the route. Routes that
  // consist solely of optional parameters (e.g. `[[id]].tsx`,
  // `(group)/[[id]].tsx`) start with `{/` and would never match — they need
  // to be reformatted to `/{…}?` so they match the bare `/` and `/value`.
  let nonOptionalSegments = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Case: /[...foo].tsx
    if (part.startsWith("[...") && part.endsWith("]")) {
      route += `/:${part.slice(4, part.length - 1)}*`;
      nonOptionalSegments++;
      continue;
    }

    // Route groups like /foo/(bar) should not be included in URL
    // matching. They are transparent and need to be removed here.
    // Case: /foo/(bar) -> /foo
    // Case: /foo/(bar)/bob -> /foo/bob
    // Case: /(foo)/bar -> /bar
    if (!options?.keepGroups && part.startsWith("(") && part.endsWith(")")) {
      continue;
    }

    // Disallow neighbouring params like `/[id][bar].tsx` because
    // it's ambiguous where the `id` param ends and `bar` begins.
    if (part.includes("][")) {
      throw new SyntaxError(
        `Invalid route pattern: "${path}". A parameter cannot be followed by another parameter without any characters in between.`,
      );
    }

    // Case: /[[id]].tsx
    // Case: /[id].tsx
    // Case: /[id]@[bar].tsx
    // Case: /[id]-asdf.tsx
    // Case: /[id]-asdf[bar].tsx
    // Case: /asdf[bar].tsx
    let pattern = "";
    let groupOpen = 0;
    let optional = false;
    for (let j = 0; j < part.length; j++) {
      const char = part[j];
      if (char === "[") {
        if (part[j + 1] === "[") {
          // Disallow optional dynamic params like `foo-[[bar]]`
          if (part[j - 1] !== "/" && !!part[j - 1]) {
            throw new SyntaxError(
              `Invalid route pattern: "${path}". An optional parameter needs to be a full segment.`,
            );
          }
          groupOpen++;
          optional = true;
          pattern += "{/";
          j++;
        }
        pattern += ":";
        groupOpen++;
      } else if (char === "]") {
        if (part[j + 1] === "]") {
          // Disallow optional dynamic params like `[[foo]]-bar`
          if (part[j + 2] !== "/" && !!part[j + 2]) {
            throw new SyntaxError(
              `Invalid route pattern: "${path}". An optional parameter needs to be a full segment.`,
            );
          }
          groupOpen--;
          pattern += "}?";
          j++;
        }
        if (--groupOpen < 0) {
          throw new SyntaxError(`Invalid route pattern: "${path}"`);
        }
      } else {
        pattern += char;
      }
    }

    route += (optional ? "" : "/") + pattern;
    if (!optional) nonOptionalSegments++;
  }

  // Case: /(group)/index.tsx
  if (route === "") {
    route = "/";
  }

  // Case: /[[id]].tsx — the route is one or more optional segments only.
  // Pattern would be `{/:id}?` which path-to-regexp treats as invalid;
  // reformat to `/{:id}?` so it matches `/` and `/value`.
  if (route.startsWith("{/") && nonOptionalSegments === 0) {
    route = "/" + route.replace(/^\{\//, "{");
  }

  return route;
}

export function patternToSegments(
  path: string,
  root: string,
  includeLast: boolean = false,
): string[] {
  const out: string[] = [root];

  if (path === "/" || path === "*" || path === "/*") return out;

  // Strip optional groups like `{/:param}?` before segmenting so middleware
  // and layouts registered at a parent path still apply to children with
  // optional parameters. e.g. `/api{/:opt}?/endpoint` segments the same way
  // as `/api/endpoint`, so a middleware at `/api` matches both forms.
  const cleaned = path.replace(/\{[^}]*\}\??/g, "");

  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (ch === "/") {
      if (i > 0) {
        const raw = cleaned.slice(start + 1, i);
        out.push(raw);
      }
      start = i;
    }
  }

  if (includeLast && start < cleaned.length - 1) {
    out.push(cleaned.slice(start + 1));
  }

  return out;
}

export function mergePath(
  basePath: string,
  path: string,
  isMounting: boolean,
): string {
  if (basePath.endsWith("*")) basePath = basePath.slice(0, -1);
  if (basePath === "/") basePath = "";

  if (path === "*") path = isMounting ? "" : "/*";
  else if (path === "/*") path = "/*";

  const s = (basePath !== "" && path === "/") ? "" : path;
  return basePath + s;
}

export function toRoutePath(path: string): string {
  if (path === "") return "*";
  return path;
}
