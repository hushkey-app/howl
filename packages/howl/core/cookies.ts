// packages/core/cookies.ts

/**
 * Options accepted by {@linkcode CookieManager.set} — mirror the standard
 * `Set-Cookie` attributes. Defaults: `path="/"`, `httpOnly=true`,
 * `sameSite="Strict"`. `secure` is auto-detected from `x-forwarded-proto`.
 */
export interface CookieOptions {
  /** `Path` attribute. Defaults to `/`. */
  path?: string;
  /** `Domain` attribute. */
  domain?: string;
  /** `Secure` attribute. Auto-detected from `x-forwarded-proto` when omitted. */
  secure?: boolean;
  /** `HttpOnly` attribute. Defaults to `true`. */
  httpOnly?: boolean;
  /** `Max-Age` attribute in seconds. */
  maxAge?: number;
  /** `Expires` attribute as a `Date`. */
  expires?: Date;
  /** `SameSite` attribute. Defaults to `Strict`. */
  sameSite?: "Strict" | "Lax" | "None";
}

/**
 * First-class cookie manager for Howl's Context.
 * Reads from request headers, writes to response headers.
 * Multiple Set-Cookie headers are preserved via append — never overwritten.
 */
export class CookieManager {
  #requestHeaders: Headers;
  #responseHeaders: Headers;
  /** Request cookies parsed once on first read; the header never changes. */
  #parsed: Record<string, string> | null = null;

  /** Wrap the incoming and outgoing header sets for cookie I/O. */
  constructor(requestHeaders: Headers, responseHeaders: Headers) {
    this.#requestHeaders = requestHeaders;
    this.#responseHeaders = responseHeaders;
  }

  #parse(): Record<string, string> {
    if (this.#parsed !== null) return this.#parsed;

    const parsed: Record<string, string> = {};
    const cookieHeader = this.#requestHeaders.get("cookie");
    if (cookieHeader) {
      for (const part of cookieHeader.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        const name = key.trim();
        // First occurrence wins — matches RFC 6265's "most relevant first".
        if (name && !(name in parsed)) parsed[name] = rest.join("=");
      }
    }
    this.#parsed = parsed;
    return parsed;
  }

  /**
   * Get a cookie value from the incoming request.
   *
   * @example
   * const token = ctx.cookies.get("token");
   */
  get(name: string): string | undefined {
    return this.#parse()[name];
  }

  /**
   * Set a cookie on the response.
   * Uses append — multiple cookies are preserved correctly.
   *
   * @example
   * ctx.cookies.set("token", jwt, { httpOnly: true, maxAge: 86400 });
   */
  set(name: string, value: string, options: CookieOptions = {}): void {
    const {
      path = "/",
      domain,
      httpOnly = true,
      maxAge,
      expires,
      sameSite = "Strict",
    } = options;

    // Auto-detect secure from request protocol
    const proto = this.#requestHeaders.get("x-forwarded-proto");
    const isHttps = proto === "https";
    const secure = options.secure !== undefined ? options.secure : isHttps;

    let cookie = `${name}=${value}`;
    if (path) cookie += `; Path=${path}`;
    if (secure) cookie += "; Secure";
    if (domain) cookie += `; Domain=${domain}`;
    if (httpOnly) cookie += "; HttpOnly";
    if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
    if (expires) cookie += `; Expires=${expires.toUTCString()}`;
    if (sameSite) cookie += `; SameSite=${sameSite}`;

    // CRITICAL: append not set — preserves multiple Set-Cookie headers
    this.#responseHeaders.append("Set-Cookie", cookie);
  }

  /**
   * Delete a cookie by setting Max-Age=0.
   *
   * @example
   * ctx.cookies.delete("token");
   */
  delete(name: string, options: Pick<CookieOptions, "path" | "domain"> = {}): void {
    this.set(name, "", {
      ...options,
      maxAge: 0,
      expires: new Date(0),
    });
  }

  /**
   * Get all cookies from the incoming request.
   *
   * @example
   * const all = ctx.cookies.all();
   */
  all(): Record<string, string> {
    return { ...this.#parse() };
  }
}
