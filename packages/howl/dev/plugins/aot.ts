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
  /** Absolute paths to layout modules, ordered root → leaf. */
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
          contents: generateSource(entry),
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

function generateSource(entry: AotEntry): string {
  const lines: string[] = [];
  lines.push(`import { h } from "preact";`);
  // _app is NOT bundled: it provides the page shell (<html>, <head>, <body>,
  // outlet) which is already in the DOM on first paint. The chunk only
  // contributes the inner tree that gets swapped into the partial outlet.
  entry.layouts.forEach((p, i) => {
    lines.push(`import Layout${i} from ${JSON.stringify(toFileSpec(p))};`);
  });
  lines.push(`import Page from ${JSON.stringify(toFileSpec(entry.pagePath))};`);
  lines.push(``);
  lines.push(`export function Component(props) {`);
  lines.push(`  let node = h(Page, props);`);
  for (let i = entry.layouts.length - 1; i >= 0; i--) {
    lines.push(
      `  { const child = node; node = h(Layout${i}, { ...props, Component: () => child }); }`,
    );
  }
  lines.push(`  return node;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export const route = ${JSON.stringify(entry.routePattern)};`);
  return lines.join("\n");
}
