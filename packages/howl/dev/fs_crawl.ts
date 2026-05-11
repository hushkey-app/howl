import { type FsAdapter, fsAdapter } from "../core/fs.ts";
import type { WalkEntry } from "@std/fs/walk";
import type { FsRouteFileNoMod } from "./dev_build_cache.ts";
import * as path from "@std/path";
import { pathToPattern } from "../core/router.ts";
import { CommandType } from "../core/commands.ts";
import { sortRoutePaths } from "../core/fs_routes.ts";
import type { RouteConfig } from "../core/types.ts";

const GROUP_REG = /[/\\\\]\((_[^/\\\\]+)\)[/\\\\]/;

export async function crawlRouteDir<State>(
  fs: FsAdapter,
  routeDir: string,
  ignore: RegExp[],
  onIslandSpecifier: (spec: string) => void,
): Promise<FsRouteFileNoMod<State>[]> {
  const files: FsRouteFileNoMod<State>[] = [];

  await walkDir(fs, routeDir, async (entry) => {
    // A `(_islands)` path segment is a local island folder.
    // Any route path segment wrapped in `(_...)` is ignored
    // during route collection.
    const match = entry.path.match(GROUP_REG);
    if (match !== null) {
      if (match[1] === "_islands") {
        onIslandSpecifier(entry.path);
      }
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
      // Strip comments before searching so a passing mention of "routeOverride"
      // in a doc comment doesn't accidentally force eager loading.
      const stripped = code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
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
    });
  }, ignore);

  files.sort((a, b) => sortRoutePaths(a.id, b.id));

  return files;
}

export async function walkDir(
  fs: FsAdapter,
  dir: string,
  callback: (entry: WalkEntry) => void | Promise<void>,
  ignore: RegExp[],
) {
  if (!await fs.isDirectory(dir)) return;

  const entries = fs.walk(dir, {
    includeDirs: false,
    includeFiles: true,
    exts: ["tsx", "jsx", "ts", "js"],
    skip: ignore,
  });

  for await (const entry of entries) {
    await callback(entry);
  }
}

const ISLAND_NAME_RE = /\.island\.(tsx|jsx|ts|js)$/;

export async function crawlFsItem(
  options: { islandDir: string; routeDir: string; ignore: RegExp[] },
): Promise<{ islands: string[]; routes: FsRouteFileNoMod<unknown>[] }> {
  const islands: string[] = [];

  const [, routes] = await Promise.all([
    walkDir(
      fsAdapter,
      options.islandDir,
      (entry) => {
        if (!ISLAND_NAME_RE.test(entry.path)) {
          throw new Error(
            `${entry.path} is in the islands directory but is not named *.island.tsx. ` +
              `Rename the file to follow the framework convention.`,
          );
        }
        islands.push(entry.path);
      },
      options.ignore,
    ),
    crawlRouteDir(
      fsAdapter,
      options.routeDir,
      options.ignore,
      (entry) => {
        if (!ISLAND_NAME_RE.test(entry)) {
          throw new Error(
            `${entry} is registered as an island via (_islands) but is not named *.island.tsx. ` +
              `Rename the file to follow the framework convention.`,
          );
        }
        islands.push(entry);
      },
    ),
  ]);

  return { islands, routes };
}
