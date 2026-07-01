/**
 * Route value + shape primitives, kept in a dependency-free leaf module so both
 * the location atom (`./state.ts`) and the router API (`./router.ts`) can import
 * them without forming an import cycle.
 *
 * `state.ts` reads {@linkcode EMPTY_ROUTE} at module-evaluation time (the initial
 * atom value). If that constant lived in `router.ts` — which imports `state.ts`
 * for `howlLocationAtom` — the two modules form a cycle whose evaluation order is
 * entry-graph dependent: the dev graph happens to initialize `EMPTY_ROUTE` first,
 * but the compiled/production graph enters via `router.ts` and evaluates
 * `state.ts` before reaching the `EMPTY_ROUTE` declaration, throwing a TDZ
 * ("Cannot access 'EMPTY_ROUTE' before initialization"). A leaf module has no
 * back-edge, so it is always fully evaluated before either importer runs.
 */

/**
 * The current route. Read reactively with `useRoute` — the value updates (and
 * consuming components re-render) on every navigation.
 */
export interface HowlRoute {
  /** Full href of the current location. */
  href: string;
  /** Pathname (no query / hash). */
  path: string;
  /** Query-string params as a flat record. */
  query: Record<string, string>;
  /** Matched route params (`/users/:id` → `{ id }`). */
  params: Record<string, string>;
  /** URL hash including the leading `#`, or `""` when absent. */
  hash: string;
  /** Matched route pattern (e.g. `/users/:id`), or `null`. */
  route: string | null;
}

/** The route value before any navigation is recorded (SSR/first-paint default). */
export const EMPTY_ROUTE: HowlRoute = {
  href: "",
  path: "",
  query: {},
  params: {},
  hash: "",
  route: null,
};

/** Parse `href` into a `URL`, returning `null` when it isn't a valid URL. */
function safeUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/**
 * Derive a {@linkcode HowlRoute} from a page-props bag. Shared by the server
 * engine (to seed the SSR atom) and the client boot (to update it on nav), so
 * both observe an identical route shape.
 */
export function toHowlRoute(props: Record<string, unknown>): HowlRoute {
  const raw = props.url;
  const url = raw instanceof URL ? raw : typeof raw === "string" ? safeUrl(raw) : null;
  return {
    href: url?.href ?? "",
    path: url?.pathname ?? "",
    query: (props.query as Record<string, string> | undefined) ??
      (url !== null ? Object.fromEntries(url.searchParams) : {}),
    params: (props.params as Record<string, string> | undefined) ?? {},
    hash: url?.hash ?? "",
    route: (props.route as string | null | undefined) ?? null,
  };
}
