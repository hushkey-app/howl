import type { Plugin as EsbuildPlugin } from "esbuild";
import * as path from "@std/path";

/**
 * Describes one ahead-of-time-compiled page entry — the page module plus its
 * resolved layout chain (root → leaf) and optional `_app.tsx` wrapper. Each
 * entry is bundled into its own client chunk and registered with the AOT
 * client runtime so subsequent in-app navigation can mount the page without
 * round-tripping the server.
 */
export interface AotEntry {
  /** Unique esbuild entry-point name. */
  name: string;
  /** URL pattern this AOT chunk serves (e.g. `/jobs`). */
  routePattern: string;
  /** Absolute path to the page module. */
  pagePath: string;
  /**
   * Absolute paths to layout modules that sit **inside** the partial outlet,
   * ordered root → leaf. Layouts that wrap the partial from outside (and the
   * `_app.tsx` shell) are not included — they already exist in the DOM on
   * first paint and stay across AOT navigations.
   */
  layouts: string[];
  /** Absolute path to the `_app.tsx` wrapper if present. */
  appPath: string | null;
}

const NAMESPACE = "howl-aot";
const PREFIX = "aot:";

/**
 * esbuild plugin that resolves synthetic `aot:<name>` entry points and emits
 * a `mount(outlet, props)` function which renders the page through its layout
 * chain into a DOM node. Generated source uses `file://` imports so the Deno
 * resolver handles the underlying modules.
 */
export function aotPlugin(entries: Map<string, AotEntry>, cwd: string): EsbuildPlugin {
  return {
    name: "howl-aot",
    setup(build) {
      build.onResolve({ filter: /^aot:/ }, (args) => ({
        path: args.path.slice(PREFIX.length),
        namespace: NAMESPACE,
      }));
      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => {
        const entry = entries.get(args.path);
        if (!entry) return null;
        return {
          contents: _generateAotSource(entry),
          loader: "ts",
          resolveDir: cwd,
        };
      });
    },
  };
}

function toFileSpec(p: string): string {
  return path.toFileUrl(p).href;
}

/** Internal: exported for unit tests of the generated chunk shape. */
export function _generateAotSource(entry: AotEntry): string {
  const lines: string[] = [];
  lines.push(`import { h } from "preact";`);
  // Nothing above the partial boundary is bundled: _app provides the page
  // shell (<html>, <head>, <body>) and any layouts that wrap the partial from
  // outside are already in the DOM on first paint. The chunk only contributes
  // what would appear inside the partial markers on an SSR response — inner
  // layouts (if any) plus the page — so the swap matches reviver-built trees
  // for stable reconciliation against existing islands.
  entry.layouts.forEach((p, i) => {
    lines.push(`import Layout${i} from ${JSON.stringify(toFileSpec(p))};`);
  });
  lines.push(`import Page from ${JSON.stringify(toFileSpec(entry.pagePath))};`);
  lines.push(``);

  if (entry.layouts.length === 0) {
    // Page-only chunk: the partial outlet contains nothing but the page.
    lines.push(`export function Component(props) {`);
    lines.push(`  return h(Page, props);`);
    lines.push(`}`);
  } else {
    // Inner layouts present. Earlier versions emitted `Component: () => child`
    // arrows inline inside Component(props), giving every re-invocation a
    // fresh function identity. Preact treats each layout's `<Component />`
    // call site as a new vnode type → page subtree force-remounted on every
    // same-chunk nav (param changes, replays). Lifting the inner-tree
    // wrappers to module scope keeps their identity stable across renders so
    // Preact can preserve component instances. Props for the deepest level
    // flow through a module-scoped `_props` slot — written synchronously by
    // Component(props) before the wrapper functions are invoked during the
    // same render cycle.
    lines.push(`let _props;`);
    lines.push(``);
    // Innermost wrapper renders the page with the current props.
    lines.push(`function PageOutlet() {`);
    lines.push(`  return h(Page, _props);`);
    lines.push(`}`);
    // Middle wrappers (if any) chain layout[i+1] into layout[i]'s Component
    // prop. The chain is built from innermost (closest to Page) outward.
    for (let i = entry.layouts.length - 1; i >= 1; i--) {
      const inner = i === entry.layouts.length - 1 ? "PageOutlet" : `Inner${i + 1}`;
      lines.push(``);
      lines.push(`function Inner${i}() {`);
      lines.push(
        `  return h(Layout${i}, { ..._props, Component: ${inner} });`,
      );
      lines.push(`}`);
    }
    lines.push(``);
    const outermostInner = entry.layouts.length === 1 ? "PageOutlet" : "Inner1";
    lines.push(`export function Component(props) {`);
    lines.push(`  _props = props;`);
    lines.push(
      `  return h(Layout0, { ...props, Component: ${outermostInner} });`,
    );
    lines.push(`}`);
  }

  lines.push(``);
  lines.push(`export const route = ${JSON.stringify(entry.routePattern)};`);
  return lines.join("\n");
}
