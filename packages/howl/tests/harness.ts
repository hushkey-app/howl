import { Howl, type HowlOptions } from "../core/app.ts";
import { MockBuildCache } from "../core/test_utils.ts";
import { setBuildCache } from "../core/app.ts";

/**
 * Lightweight test harness — wraps a {@linkcode Howl} app and gives back a
 * `fetch`-style helper that goes straight through the handler without
 * binding a TCP port.
 *
 * The returned `app` is fully usable; tests can register more routes/middleware
 * before issuing the first request.
 */
export interface TestApp<State = unknown> {
  /** The Howl instance under test. */
  app: Howl<State>;
  /**
   * Fetch a path on the app. `path` may be a path (`/foo`), a path+query
   * (`/foo?bar=1`) or a full URL — the host is normalised to
   * `http://localhost`.
   */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

/** Build a {@linkcode TestApp} with a {@linkcode MockBuildCache} attached. */
// deno-lint-ignore no-explicit-any
export function makeApp<State = any>(
  options: HowlOptions = {},
): TestApp<State> {
  const app = new Howl<State>(options);
  setBuildCache(
    app,
    new MockBuildCache([], options.mode ?? "production"),
    options.mode ?? "production",
  );

  let handler: ((req: Request) => Promise<Response>) | null = null;
  const ensureHandler = () => {
    if (handler === null) handler = app.handler();
    return handler;
  };

  return {
    app,
    fetch: (path, init) => {
      const url = path.startsWith("http") ? path : `http://localhost${path}`;
      return ensureHandler()(new Request(url, init));
    },
  };
}

/** Drain a `Response` body to a string. */
export async function text(res: Response): Promise<string> {
  return await res.text();
}

/** Drain a `Response` body to a JSON value. */
export async function json<T = unknown>(res: Response): Promise<T> {
  return await res.json() as T;
}
