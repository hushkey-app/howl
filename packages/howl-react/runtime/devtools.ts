import {
  type ChangeEvent,
  createElement as h,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useState,
} from "react";
import { navigate, useRoute } from "./router.ts";

// Dev-only route map the React engine emits as `window.__HOWL_REACT_ROUTES__`.
// Read via a typed `globalThis` view rather than a `declare global` augmentation
// (banned by JSR for published packages).
const browserGlobals = globalThis as typeof globalThis & {
  __HOWL_REACT_ROUTES__?: Array<{ pattern: string; mode: string; engine: string }>;
};

const MODE_COLOR: Record<string, string> = {
  ssr: "#3b82f6",
  aot: "#42b883",
  ssg: "#f59e0b",
};

/** Read the dev route map emitted into the page (empty before first paint). */
function routeMap(): Array<{ pattern: string; mode: string; engine: string }> {
  return browserGlobals.__HOWL_REACT_ROUTES__ ?? [];
}

/** Drop a trailing slash (except root `/`) so `ctx.route` matches manifest patterns. */
function normPattern(pattern: string | null): string | null {
  if (pattern === null) return null;
  return pattern !== "/" && pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
}

const PARAM_RE = /:([A-Za-z0-9_]+)(\*|\+|\?)?/g;

/** Extract the param names from a route pattern (`/users/:id` → `["id"]`). */
export function extractParams(pattern: string): string[] {
  return [...pattern.matchAll(PARAM_RE)].map((m) => m[1]);
}

/** Substitute param values into a pattern, URL-encoding each (`/users/:id` + {id:"7"} → `/users/7`). */
export function buildPath(pattern: string, values: Record<string, string>): string {
  return pattern.replace(PARAM_RE, (_m, name: string) => encodeURIComponent(values[name] ?? ""));
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: "fixed",
    bottom: "12px",
    right: "12px",
    zIndex: 2147483647,
    fontFamily: "ui-monospace, monospace",
    fontSize: "12px",
  },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "#1e1e2e",
    color: "#cdd6f4",
    border: "1px solid #313244",
    borderRadius: "8px",
    padding: "6px 10px",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,.3)",
  },
  panel: {
    width: "320px",
    maxHeight: "60vh",
    display: "flex",
    flexDirection: "column",
    background: "#1e1e2e",
    color: "#cdd6f4",
    border: "1px solid #313244",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0,0,0,.4)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderBottom: "1px solid #313244",
    background: "#181825",
  },
  title: { fontWeight: 600 },
  close: {
    background: "transparent",
    color: "#cdd6f4",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
    lineHeight: 1,
  },
  current: {
    padding: "6px 10px",
    color: "#a6e3a1",
    borderBottom: "1px solid #313244",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  list: { overflowY: "auto", padding: "4px" },
  routeWrap: { borderRadius: "6px" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    color: "#cdd6f4",
    border: "none",
    borderRadius: "6px",
    padding: "5px 6px",
    cursor: "pointer",
  },
  rowActive: { background: "#313244" },
  tag: {
    color: "#11111b",
    borderRadius: "4px",
    padding: "1px 5px",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  pat: { flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  paramHint: { color: "#f9e2af", fontSize: "11px" },
  editor: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "6px 8px 8px 30px",
  },
  input: {
    flex: "1 1 90px",
    minWidth: "70px",
    background: "#11111b",
    color: "#cdd6f4",
    border: "1px solid #45475a",
    borderRadius: "5px",
    padding: "3px 6px",
    fontFamily: "inherit",
    fontSize: "12px",
  },
  go: {
    background: "#42b883",
    color: "#11111b",
    border: "none",
    borderRadius: "5px",
    padding: "3px 10px",
    fontWeight: 700,
    cursor: "pointer",
  },
  goOff: { background: "#45475a", color: "#7f849c", cursor: "not-allowed" },
  footer: {
    padding: "6px 10px",
    borderTop: "1px solid #313244",
    color: "#6c7086",
    background: "#181825",
  },
};

function tagStyle(mode: string): CSSProperties {
  return { ...styles.tag, background: MODE_COLOR[mode] ?? MODE_COLOR.ssr };
}

/**
 * Dev-only floating router devtools panel for the React engine — the React
 * ecosystem's convention for router visualisation (à la TanStack Router / React
 * Query devtools), since React DevTools exposes no plugin API for a custom tab.
 * Lists every route with its `ssr`/`aot`/`ssg` mode, highlights the active one,
 * shows the current path, and navigates on click. Param routes (`/users/:id`)
 * expand an inline editor — one field per param — so they're testable too.
 */
export function RouteDevtoolsPanel(): ReactNode {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const route = useRoute();
  const routes = routeMap();
  const active = normPattern(route.route);

  if (!open) {
    return h(
      "div",
      { style: styles.root },
      h("button", { style: styles.badge, onClick: () => setOpen(true) }, "⚡ routes"),
    );
  }

  const setParam = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  const rows = routes.map((r) => {
    const params = extractParams(r.pattern);
    const isActive = r.pattern === active;
    const isEditing = editing === r.pattern;

    const onRowClick = () => {
      if (params.length === 0) navigate(r.pattern);
      else setEditing((cur) => (cur === r.pattern ? null : r.pattern));
    };

    const rowBtn = h(
      "button",
      {
        key: "row",
        title: params.length === 0 ? `Navigate to ${r.pattern}` : "Fill params to navigate",
        onClick: onRowClick,
        style: { ...styles.row, ...(isActive ? styles.rowActive : {}) },
      },
      [
        h("span", { key: "m", style: tagStyle(r.mode) }, r.mode),
        h("span", { key: "p", style: styles.pat }, r.pattern),
        params.length > 0
          ? h("span", { key: "h", style: styles.paramHint }, isEditing ? "▾" : "▸")
          : null,
        isActive ? h("span", { key: "a", style: { color: "#a6e3a1" } }, "●") : null,
      ],
    );

    let editor: ReactNode = null;
    if (isEditing && params.length > 0) {
      const ready = params.every((p) => (values[p] ?? "").length > 0);
      const submit = () => {
        if (ready) navigate(buildPath(r.pattern, values));
      };
      editor = h("div", { key: "ed", style: styles.editor }, [
        ...params.map((p) =>
          h("input", {
            key: p,
            style: styles.input,
            placeholder: p,
            value: values[p] ?? "",
            onChange: (e: ChangeEvent<HTMLInputElement>) => setParam(p, e.currentTarget.value),
            onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") submit();
            },
          })
        ),
        h(
          "button",
          {
            key: "go",
            disabled: !ready,
            onClick: submit,
            style: { ...styles.go, ...(ready ? {} : styles.goOff) },
          },
          "Go →",
        ),
      ]);
    }

    return h("div", { key: r.pattern, style: styles.routeWrap }, [rowBtn, editor]);
  });

  return h("div", { style: styles.root }, [
    h("div", { key: "panel", style: styles.panel }, [
      h("div", { key: "h", style: styles.header }, [
        h("span", { key: "t", style: styles.title }, "Howl Routes"),
        h("button", { key: "x", style: styles.close, onClick: () => setOpen(false) }, "×"),
      ]),
      h("div", { key: "c", style: styles.current }, `→ ${route.path || "/"}`),
      h("div", { key: "l", style: styles.list }, rows),
      h(
        "div",
        { key: "f", style: styles.footer },
        `${routes.length} route${routes.length === 1 ? "" : "s"}`,
      ),
    ]),
  ]);
}
