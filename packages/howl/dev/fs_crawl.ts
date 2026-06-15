import { type FsAdapter, fsAdapter } from "../core/fs.ts";
import type { WalkEntry } from "@std/fs/walk";
import type { FsRouteFileNoMod } from "./dev_build_cache.ts";
import * as path from "@std/path";
import { pathToPattern } from "../core/router.ts";
import { CommandType } from "../core/commands.ts";
import { sortRoutePaths } from "../core/fs_routes.ts";
import type { RouteConfig } from "../core/types.ts";

const GROUP_REG = /[/\\\\]\((_[^/\\\\]+)\)[/\\\\]/;

/** Lowercased file extension including the dot (e.g. `.vue`, `.tsx`). */
function extOf(p: string): string {
  const i = p.lastIndexOf(".");
  return i === -1 ? "" : p.slice(i).toLowerCase();
}

export async function crawlRouteDir<State>(
  fs: FsAdapter,
  routeDir: string,
  ignore: RegExp[],
  engineByExt?: Record<string, string>,
): Promise<FsRouteFileNoMod<State>[]> {
  const files: FsRouteFileNoMod<State>[] = [];

  await walkDir(
    fs,
    routeDir,
    async (entry) => {
      // Any route path segment wrapped in `(_...)` is ignored during route
      // collection — colocate non-route files (components, helpers) there.
      const match = entry.path.match(GROUP_REG);
      if (match !== null) {
        return;
      }

      let lazy = false;
      const relative = path.relative(routeDir, entry.path);
      const url = new URL(relative, "http://localhost/");
      let id = url.pathname.slice(0, url.pathname.lastIndexOf("."));

      // Page-file prefix opts into client-side navigation:
      //   `__page.tsx`  → AOT (dynamic SSR + client-nav chunk)
      //   `___page.tsx` → SSG (prerendered HTML at build + AOT chunk)
      // The prefix is stripped from the URL pattern so the route mounts at
      // its plain path. SSG implies AOT.
      let aot = false;
      let ssg = false;
      const lastSlash = id.lastIndexOf("/");
      const basename = id.slice(lastSlash + 1);
      if (basename.startsWith("___")) {
        aot = true;
        ssg = true;
        id = `${id.slice(0, lastSlash + 1)}${basename.slice(3)}`;
      } else if (basename.startsWith("__")) {
        aot = true;
        id = `${id.slice(0, lastSlash + 1)}${basename.slice(2)}`;
      }

      let overrideConfig: RouteConfig | undefined;
      let pattern = "*";
      let routePattern = pattern;
      let type = CommandType.Route;
      if (id.endsWith("/_middleware")) {
        type = CommandType.Middleware;
        pattern = pathToPattern(
          id.slice(1, -"/_middleware".length),
          { keepGroups: true },
        );
        routePattern = pattern;
      } else if (id.endsWith("/_layout")) {
        type = CommandType.Layout;
        pattern = pathToPattern(
          id.slice(1, -"/_layout".length),
          { keepGroups: true },
        );
        routePattern = pattern;
      } else if (id.endsWith("/_app")) {
        type = CommandType.App;
      } else if (id.endsWith("/_404")) {
        type = CommandType.NotFound;
      } else if (id.endsWith("/_error") || id.endsWith("/_500")) {
        type = CommandType.Error;
        pattern = pathToPattern(
          id.slice(1, -"/_error".length),
          { keepGroups: true },
        );
        routePattern = pattern;
      } else {
        pattern = pathToPattern(id.slice(1), { keepGroups: true });
        if (id.endsWith("/index")) {
          if (!pattern.endsWith("/")) {
            pattern += "/";
          }
        }

        routePattern = pathToPattern(id.slice(1));

        const code = await fs.readTextFile(entry.path);
        // Strip string literals and comments before searching so a passing
        // mention of "routeOverride" in a doc comment or string doesn't
        // accidentally force eager loading. (The real usage is a config key,
        // never quoted text.)
        const stripped = code.replace(
          /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
          "",
        );
        lazy = !/\brouteOverride\b/.test(stripped);

        // TODO: We could do an AST parse here to detect the
        // kind of handler that's used to get a more accurate
        // list of methods this route supports.
        overrideConfig = {
          methods: "ALL",
        };
      }

      files.push({
        id,
        filePath: entry.path,
        type,
        pattern,
        routePattern,
        lazy,
        css: [],
        overrideConfig,
        aot,
        ssg,
        // Render engine for this route is decided by the registered engine
        // plugins (each declares the extensions it owns, e.g. `vuePlugin` →
        // `.vue`, `reactPlugin` → `.tsx`). This keeps engines out of core.
        engine: engineByExt?.[extOf(entry.path)],
      });
    },
    ignore,
    ["tsx", "jsx", "ts", "js", "vue"],
  );

  files.sort((a, b) => sortRoutePaths(a.id, b.id));

  return files;
}

export async function walkDir(
  fs: FsAdapter,
  dir: string,
  callback: (entry: WalkEntry) => void | Promise<void>,
  ignore: RegExp[],
  exts: string[] = ["tsx", "jsx", "ts", "js"],
) {
  if (!await fs.isDirectory(dir)) return;

  const entries = fs.walk(dir, {
    includeDirs: false,
    includeFiles: true,
    exts,
    skip: ignore,
  });

  for await (const entry of entries) {
    await callback(entry);
  }
}

export async function crawlFsItem(
  options: {
    routeDir: string;
    ignore: RegExp[];
    engineByExt?: Record<string, string>;
  },
): Promise<{ routes: FsRouteFileNoMod<unknown>[] }> {
  const routes = await crawlRouteDir(
    fsAdapter,
    options.routeDir,
    options.ignore,
    options.engineByExt,
  );

  return { routes };
}
