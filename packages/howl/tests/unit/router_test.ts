import { expect } from "@std/expect";
import {
  mergePath,
  type Method,
  pathToPattern,
  patternToSegments,
  UrlPatternRouter,
} from "../../core/router.ts";

Deno.test("router — static pattern matches by exact pathname", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/about", "about");

  const hit = r.match("GET", new URL("http://x/about"));
  expect(hit.item).toBe("about");
  expect(hit.methodMatch).toBe(true);
  expect(hit.pattern).toBe("/about");
});

Deno.test("router — dynamic pattern decodes URL-encoded params", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/users/:id", "user");

  const hit = r.match("GET", new URL("http://x/users/foo%20bar"));
  expect(hit.params).toEqual({ id: "foo bar" });
});

Deno.test("router — method mismatch returns methodMatch=false but keeps pattern", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/r", "g");

  const miss = r.match("POST", new URL("http://x/r"));
  expect(miss.pattern).toBe("/r");
  expect(miss.methodMatch).toBe(false);
  expect(miss.item).toBeNull();
});

Deno.test("router — HEAD falls back to GET handlers when none registered", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/r", "g");

  const hit = r.match("HEAD", new URL("http://x/r"));
  expect(hit.item).toBe("g");
  expect(hit.methodMatch).toBe(true);
});

Deno.test("router — unknown path leaves pattern null", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/r", "g");

  const miss = r.match("GET", new URL("http://x/missing"));
  expect(miss.pattern).toBeNull();
  expect(miss.methodMatch).toBe(false);
});

Deno.test("router — request with trailing slash matches route registered without one", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/wissen", "A");

  const hit = r.match("GET", new URL("http://x/wissen/"));
  expect(hit.item).toBe("A");
  expect(hit.methodMatch).toBe(true);
  // The matched pattern reflects the registered route, not the request URL.
  expect(hit.pattern).toBe("/wissen");
});

Deno.test("router — request without trailing slash matches route registered with one", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/wissen/", "A");

  const hit = r.match("GET", new URL("http://x/wissen"));
  expect(hit.item).toBe("A");
  expect(hit.methodMatch).toBe(true);
  expect(hit.pattern).toBe("/wissen/");
});

Deno.test("router — exact match wins over trailing-slash fallback", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/wissen", "A");
  r.add("GET", "/wissen/", "B");

  const withSlash = r.match("GET", new URL("http://x/wissen/"));
  expect(withSlash.item).toBe("B");
  expect(withSlash.pattern).toBe("/wissen/");

  const withoutSlash = r.match("GET", new URL("http://x/wissen"));
  expect(withoutSlash.item).toBe("A");
  expect(withoutSlash.pattern).toBe("/wissen");
});

Deno.test("router — root path doesn't fall back to alternate slash form", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/", "A");

  const hit = r.match("GET", new URL("http://x/"));
  expect(hit.item).toBe("A");
  expect(hit.pattern).toBe("/");
});

Deno.test("router — root-level optional [[param]] matches both / and /value", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", pathToPattern("[[id]]"), "root");

  const bare = r.match("GET", new URL("http://x/"));
  expect(bare.methodMatch).toBe(true);
  expect(bare.item).toBe("root");
  expect(bare.params.id).toBe("");

  const withParam = r.match("GET", new URL("http://x/abc"));
  expect(withParam.methodMatch).toBe(true);
  expect(withParam.item).toBe("root");
  expect(withParam.params).toEqual({ id: "abc" });
});

Deno.test("router — getAllowedMethods returns every registered verb", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/r", "g");
  r.add("POST", "/r", "p");
  r.add("DELETE", "/r", "d");

  const allowed = r.getAllowedMethods("/r");
  expect(allowed.sort()).toEqual(["DELETE", "GET", "POST"]);
});

Deno.test("router — first registered route wins on duplicate", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/foo", "first");
  r.add("GET", "/foo", "second");

  const hit = r.match("GET", new URL("http://x/foo"));
  expect(hit.item).toBe("first");
});

// --- Overlapping dynamic patterns under different param names -------------
//
// Two routes can occupy the same URL slot under different param names
// (`/x/:id` vs `/x/:projectId`). They are stored as separate dynamic defs, so
// `match()` must keep scanning overlapping path matches until one serves the
// requested method — instead of stopping at the first path match. Regression
// for the 405-on-a-registered-method bug.

Deno.test("router — overlap: later pattern serving the method is resolved, not 405", () => {
  const r = new UrlPatternRouter<string>();
  r.add("POST", "/api/task/:projectId", "create"); // registered first
  r.add("DELETE", "/api/task/:id", "delete");
  r.add("GET", "/api/task/:id", "get");

  const hit = r.match("GET", new URL("http://x/api/task/abc123"));
  expect(hit.methodMatch).toBe(true);
  expect(hit.item).toBe("get");
  // Params are decoded from the def that actually serves the method, so the
  // handler receives the param under the name it declared.
  expect(hit.params).toEqual({ id: "abc123" });
  expect(hit.pattern).toBe("/api/task/:id");
});

Deno.test("router — overlap: method genuinely absent still yields 405-shape", () => {
  const r = new UrlPatternRouter<string>();
  r.add("POST", "/api/task/:projectId", "create");
  r.add("DELETE", "/api/task/:id", "delete");
  r.add("GET", "/api/task/:id", "get");

  // No PATCH anywhere on this slot ⇒ methodMatch false, but pattern is set so
  // the caller emits 405 (not a misleading 404).
  const miss = r.match("PATCH", new URL("http://x/api/task/abc123"));
  expect(miss.methodMatch).toBe(false);
  expect(miss.item).toBeNull();
  expect(miss.pattern).not.toBeNull();
  // 405 fallback reports the first matched pattern in registration order.
  expect(miss.pattern).toBe("/api/task/:projectId");
});

Deno.test("router — overlap: the first-registered pattern's own method still resolves", () => {
  const r = new UrlPatternRouter<string>();
  r.add("POST", "/api/task/:projectId", "create"); // registered first
  r.add("GET", "/api/task/:id", "get");

  const hit = r.match("POST", new URL("http://x/api/task/p-1"));
  expect(hit.methodMatch).toBe(true);
  expect(hit.item).toBe("create");
  expect(hit.params).toEqual({ projectId: "p-1" });
  expect(hit.pattern).toBe("/api/task/:projectId");
});

Deno.test("router — overlap: GET resolves when DELETE-only pattern is registered first (task-relation)", () => {
  const r = new UrlPatternRouter<string>();
  r.add("DELETE", "/api/task-relation/:id", "del"); // registered first
  r.add("GET", "/api/task-relation/:taskId", "list");

  const hit = r.match("GET", new URL("http://x/api/task-relation/t-9"));
  expect(hit.methodMatch).toBe(true);
  expect(hit.item).toBe("list");
  expect(hit.params).toEqual({ taskId: "t-9" });

  const del = r.match("DELETE", new URL("http://x/api/task-relation/t-9"));
  expect(del.methodMatch).toBe(true);
  expect(del.item).toBe("del");
  expect(del.params).toEqual({ id: "t-9" });
});

Deno.test("router — overlap: three+ patterns on one slot all resolve to their own method", () => {
  const r = new UrlPatternRouter<string>();
  // Spread the methods across distinctly-named, separately-registered defs and
  // interleave registration order to make sure resolution is method-driven,
  // not position-driven.
  r.add("POST", "/api/column/:projectId", "create");
  r.add("DELETE", "/api/column/:id", "delete");
  r.add("GET", "/api/column/:projectId", "list");
  r.add("PUT", "/api/column/:id", "update");

  const cases: Array<[Method, string, string]> = [
    ["POST", "create", "projectId"],
    ["GET", "list", "projectId"],
    ["DELETE", "delete", "id"],
    ["PUT", "update", "id"],
  ];
  for (const [method, item, paramName] of cases) {
    const hit = r.match(method, new URL("http://x/api/column/v"));
    expect(hit.methodMatch).toBe(true);
    expect(hit.item).toBe(item);
    expect(hit.params).toEqual({ [paramName]: "v" });
  }
});

Deno.test("router — overlap: HEAD falls back to a GET on a later overlapping pattern", () => {
  const r = new UrlPatternRouter<string>();
  r.add("POST", "/api/workflow-rule/:id", "create"); // registered first, no GET
  r.add("GET", "/api/workflow-rule/:projectId", "list");

  const head = r.match("HEAD", new URL("http://x/api/workflow-rule/w-1"));
  expect(head.methodMatch).toBe(true);
  expect(head.item).toBe("list");
  expect(head.params).toEqual({ projectId: "w-1" });
});

Deno.test("router — overlap: getAllowedMethods stays per literal pattern", () => {
  const r = new UrlPatternRouter<string>();
  r.add("POST", "/api/task/:projectId", "create");
  r.add("GET", "/api/task/:id", "get");

  // The string-keyed accessor reports exactly one pattern's verbs — the union
  // across overlaps is `allowedMethodsForUrl`, tested below.
  expect(r.getAllowedMethods("/api/task/:projectId")).toEqual(["POST"]);
  expect(r.getAllowedMethods("/api/task/:id")).toEqual(["GET"]);
});

Deno.test("router — allowedMethodsForUrl unions verbs across overlapping dynamic patterns", () => {
  const r = new UrlPatternRouter<string>();
  r.add("POST", "/api/task/:projectId", "create");
  r.add("DELETE", "/api/task/:id", "delete");
  r.add("GET", "/api/task/:id", "get");

  const allowed = r.allowedMethodsForUrl(new URL("http://x/api/task/abc"));
  expect(allowed.sort()).toEqual(["DELETE", "GET", "POST"]);
});

Deno.test("router — allowedMethodsForUrl on a single dynamic pattern returns just its verbs", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/users/:id", "get");
  r.add("PUT", "/users/:id", "put");

  const allowed = r.allowedMethodsForUrl(new URL("http://x/users/7"));
  expect(allowed.sort()).toEqual(["GET", "PUT"]);
});

Deno.test("router — allowedMethodsForUrl: a matching static slot shadows dynamic overlaps", () => {
  const r = new UrlPatternRouter<string>();
  // Static is exact-matched and shadows the dynamic in match(), so the
  // dynamic's POST is unreachable at /api/task/all — Allow must reflect that.
  r.add("GET", "/api/task/all", "static");
  r.add("POST", "/api/task/:id", "create");

  const allowed = r.allowedMethodsForUrl(new URL("http://x/api/task/all"));
  expect(allowed).toEqual(["GET"]);
});

Deno.test("router — allowedMethodsForUrl honours the trailing-slash static fallback", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/wissen", "A");
  r.add("DELETE", "/wissen", "B");

  // Request carries a trailing slash; resolution falls back to the registered
  // slashless static, same as match().
  const allowed = r.allowedMethodsForUrl(new URL("http://x/wissen/"));
  expect(allowed.sort()).toEqual(["DELETE", "GET"]);
});

Deno.test("router — allowedMethodsForUrl returns empty for an unmatched path", () => {
  const r = new UrlPatternRouter<string>();
  r.add("GET", "/api/task/:id", "get");

  expect(r.allowedMethodsForUrl(new URL("http://x/api/other/1"))).toEqual([]);
});

Deno.test("router — overlap: a path matching no dynamic pattern is still 404 (pattern null)", () => {
  const r = new UrlPatternRouter<string>();
  r.add("POST", "/api/task/:projectId", "create");
  r.add("GET", "/api/task/:id", "get");

  const miss = r.match("GET", new URL("http://x/api/other/abc"));
  expect(miss.pattern).toBeNull();
  expect(miss.methodMatch).toBe(false);
  expect(miss.item).toBeNull();
});

Deno.test("router — overlap: a serving static slot still short-circuits before dynamics", () => {
  const r = new UrlPatternRouter<string>();
  // Static exact match must win over any dynamic overlap, by design.
  r.add("GET", "/api/task/all", "static-all");
  r.add("POST", "/api/task/:projectId", "create");
  r.add("GET", "/api/task/:id", "dynamic");

  const hit = r.match("GET", new URL("http://x/api/task/all"));
  expect(hit.item).toBe("static-all");
  expect(hit.pattern).toBe("/api/task/all");
});

Deno.test("pathToPattern — index segment collapses to /", () => {
  expect(pathToPattern("index")).toBe("/");
  expect(pathToPattern("foo/index")).toBe("/foo");
});

Deno.test("pathToPattern — [param] becomes :param", () => {
  expect(pathToPattern("users/[id]")).toBe("/users/:id");
});

Deno.test("pathToPattern — [...rest] becomes :rest*", () => {
  expect(pathToPattern("files/[...path]")).toBe("/files/:path*");
});

Deno.test("pathToPattern — (group) segments are stripped", () => {
  expect(pathToPattern("foo/(group)/bar")).toBe("/foo/bar");
});

Deno.test("pathToPattern — [[param]] generates an optional segment", () => {
  // Mixed required + optional: required prefix is preserved.
  expect(pathToPattern("users/[[id]]")).toBe("/users{/:id}?");
});

Deno.test("pathToPattern — root-level [[param]] no longer 404s", () => {
  // Bare optional at root: would have produced "{/:id}?" (invalid pattern,
  // never matches). Fixed to "/{:id}?" so it matches "/" and "/value".
  expect(pathToPattern("[[id]]")).toBe("/{:id}?");
});

Deno.test("pathToPattern — (group)/[[param]]/(group2)/index resolves to /{:param}?", () => {
  // Groups are transparent, so a route consisting only of groups + an
  // optional param is equivalent to a bare [[param]] at root.
  expect(pathToPattern("(group)/[[name]]/(group2)/index")).toBe("/{:name}?");
});

Deno.test("patternToSegments — plain path splits into segments", () => {
  expect(patternToSegments("/api/users", "")).toEqual(["", "api"]);
  expect(patternToSegments("/api/users", "", true)).toEqual([
    "",
    "api",
    "users",
  ]);
});

Deno.test("patternToSegments — optional {/:param}? group is stripped before segmenting", () => {
  // Without the strip, `/api{/:opt}?/endpoint` would produce extra segments
  // like "api{" or "}?" and middleware registered at /api wouldn't match
  // routes with optional params under it. After the fix, it behaves
  // identically to `/api/endpoint`.
  expect(patternToSegments("/api{/:opt}?/endpoint", "")).toEqual(["", "api"]);
  expect(patternToSegments("/api{/:opt}?/endpoint", "", true)).toEqual([
    "",
    "api",
    "endpoint",
  ]);
});

Deno.test("patternToSegments — root-level optional pattern collapses cleanly", () => {
  // pathToPattern("[[name]]") → "/{:name}?" — segments should be just [root]
  // since stripping the optional group leaves the empty string.
  expect(patternToSegments("/{:name}?", "")).toEqual([""]);
});

Deno.test("mergePath — basePath + path joins safely", () => {
  expect(mergePath("/api", "/users", false)).toBe("/api/users");
  expect(mergePath("/api", "/", false)).toBe("/api");
  expect(mergePath("", "/users", false)).toBe("/users");
});
