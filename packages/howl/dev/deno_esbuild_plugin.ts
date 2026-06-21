import {
  MediaType,
  RequestedModuleType,
  ResolutionMode,
  Workspace,
  type WorkspaceOptions,
} from "@deno/loader";
import type {
  Loader,
  OnLoadArgs,
  OnLoadResult,
  OnResolveArgs,
  OnResolveResult,
  Platform,
  Plugin,
} from "esbuild";
import * as path from "@std/path";
import { isBuiltin } from "node:module";

/**
 * Options for {@linkcode denoPlugin}. Mirrors the upstream
 * `@deno/esbuild-plugin` option surface so this vendored copy is a drop-in
 * replacement.
 */
export interface DenoPluginOptions {
  /** Emit verbose resolution/load logging from the underlying Deno loader. */
  debug?: boolean;
  /** Path to a `deno.json` to use instead of auto-discovering one. */
  configPath?: string;
  /** Load modules without transpiling TypeScript/JSX (pass raw source through). */
  noTranspile?: boolean;
  /** Keep JSX as-is instead of transpiling per `compilerOptions`. */
  preserveJsx?: boolean;
  /**
   * Prefix for public environment variables to inline during bundling, e.g.
   * `howl_PUBLIC_`. Matching `Deno.env.get(...)` / `process.env.*` reads are
   * replaced with their literal values.
   */
  publicEnvVarPrefix?: string;
}

/**
 * Nearest-`package.json` lookup result, cached per directory so the sideEffects
 * walk runs once per package rather than once per resolved file.
 */
interface PkgInfo {
  /** Directory containing the resolved `package.json`. */
  pkgDir: string;
  /** Raw `sideEffects` value from that `package.json` (any shape). */
  sideEffects: unknown;
}

const pkgInfoCache = new Map<string, PkgInfo | null>();

/**
 * Walk up from `startDir` to the nearest `package.json`, mirroring Node's
 * resolution. Every directory on the path is memoised to the same result.
 */
function nearestPkg(startDir: string): PkgInfo | null {
  const chain: string[] = [];
  let dir = startDir;
  for (let i = 0; i < 40; i++) {
    const cached = pkgInfoCache.get(dir);
    if (cached !== undefined) {
      for (const d of chain) pkgInfoCache.set(d, cached);
      return cached;
    }
    chain.push(dir);
    try {
      const raw = Deno.readTextFileSync(path.join(dir, "package.json"));
      let sideEffects: unknown;
      try {
        sideEffects = JSON.parse(raw).sideEffects;
      } catch {
        sideEffects = undefined;
      }
      const info: PkgInfo = { pkgDir: dir, sideEffects };
      for (const d of chain) pkgInfoCache.set(d, info);
      return info;
    } catch {
      // No package.json at this level — keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const d of chain) pkgInfoCache.set(d, null);
  return null;
}

/** Convert a `package.json` `sideEffects` glob into an anchored RegExp. */
function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + out + "$");
}

/**
 * Resolve esbuild's `sideEffects` flag for a disk file from its package's
 * `package.json`. Returns `false` only when the package guarantees the file is
 * side-effect-free (`"sideEffects": false`, or an array of globs none of which
 * match) so esbuild can tree-shake it; `undefined` otherwise, leaving esbuild's
 * default (treat as side-effectful) untouched. This is the one behaviour the
 * upstream Deno plugin omits — without it esbuild keeps every member of a
 * re-export barrel (lucide-react, date-fns, ...) even when a single named
 * import is used.
 */
function fileSideEffects(file: string): false | undefined {
  const info = nearestPkg(path.dirname(file));
  if (!info) return undefined;
  const se = info.sideEffects;
  if (se === false) return false;
  if (Array.isArray(se)) {
    const rel = path.relative(info.pkgDir, file).replaceAll("\\", "/");
    const base = path.basename(file);
    const sideEffectful = se.some((entry) => {
      const glob = String(entry).startsWith("./")
        ? String(entry).slice(2)
        : String(entry);
      const re = globToRegExp(glob);
      return re.test(rel) || (!glob.includes("/") && re.test(base));
    });
    return sideEffectful ? undefined : false;
  }
  return undefined;
}

/** Map a Deno loader {@linkcode MediaType} to the esbuild {@linkcode Loader}. */
function mediaToLoader(type: MediaType): Loader {
  switch (type) {
    case MediaType.Jsx:
      return "jsx";
    case MediaType.JavaScript:
    case MediaType.Mjs:
    case MediaType.Cjs:
      return "js";
    case MediaType.TypeScript:
    case MediaType.Mts:
    case MediaType.Dmts:
    case MediaType.Dcts:
      return "ts";
    case MediaType.Tsx:
      return "tsx";
    case MediaType.Css:
      return "css";
    case MediaType.Json:
      return "json";
    case MediaType.Wasm:
      return "binary";
    case MediaType.SourceMap:
      return "json";
    default:
      return "default";
  }
}

/** Map esbuild's `platform` to the Deno loader's narrower workspace platform. */
function getPlatform(platform: Platform | undefined): WorkspaceOptions["platform"] {
  switch (platform) {
    case "browser":
      return "browser";
    case "node":
      return "node";
    default:
      return undefined;
  }
}

/** Derive the loader's requested module type from the import attributes. */
function getModuleType(
  file: string,
  withArgs: Record<string, string>,
): RequestedModuleType {
  switch (withArgs.type) {
    case "text":
      return RequestedModuleType.Text;
    case "bytes":
      return RequestedModuleType.Bytes;
    case "json":
      return RequestedModuleType.Json;
    default:
      return file.endsWith(".json")
        ? RequestedModuleType.Json
        : RequestedModuleType.Default;
  }
}

/** Convert an esbuild `external` glob entry into an anchored RegExp. */
function externalToRegex(external: string): RegExp {
  return new RegExp(
    "^" +
      external.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&").replace(/\*/g, ".*") +
      "$",
  );
}

/**
 * Vendored copy of `@deno/esbuild-plugin`'s `denoPlugin`, wiring Deno's module
 * resolution/loading into esbuild via `@deno/loader`.
 *
 * It is vendored (rather than depended on) for **one** reason: the upstream
 * plugin returns its `onResolve` results without a `sideEffects` flag, so
 * esbuild — which never reads `package.json` for plugin-resolved paths — treats
 * every npm module as side-effectful and cannot tree-shake re-export barrels. A
 * single `lucide-react` icon imported through the upstream plugin pulls the
 * entire ~400 KB icon set; here it shakes down to a few KB. The only functional
 * delta from upstream is the {@linkcode fileSideEffects} call on resolved disk
 * files; everything else mirrors upstream so this stays a drop-in replacement.
 *
 * This is a **permanent fork**, not a temporary vendor: upstream
 * `@deno/esbuild-plugin` is effectively unmaintained (Deno's own tooling moved
 * to Vite), so the fix will not land there. We own this thin glue and depend
 * directly on the still-maintained `@deno/loader` WASM resolver underneath.
 *
 * @param options Resolution/load behaviour. See {@linkcode DenoPluginOptions}.
 * @returns An esbuild {@linkcode Plugin}.
 */
export function denoPlugin(options: DenoPluginOptions = {}): Plugin {
  return {
    name: "deno",
    async setup(ctx) {
      const workspace = new Workspace({
        debug: options.debug,
        configPath: options.configPath,
        nodeConditions: ctx.initialOptions.conditions,
        noTranspile: options.noTranspile,
        preserveJsx: options.preserveJsx,
        platform: getPlatform(ctx.initialOptions.platform),
      });

      const loader = await workspace.createLoader();
      ctx.onDispose(() => {
        loader[Symbol.dispose]?.();
      });

      const externals = (ctx.initialOptions.external ?? []).map((item) =>
        externalToRegex(item)
      );

      const onResolve = async (
        args: OnResolveArgs,
      ): Promise<OnResolveResult | null> => {
        if (isBuiltin(args.path) || externals.some((reg) => reg.test(args.path))) {
          return { path: args.path, external: true };
        }
        const kind =
          args.kind === "require-call" || args.kind === "require-resolve"
            ? ResolutionMode.Require
            : ResolutionMode.Import;

        try {
          const res = await loader.resolve(args.path, args.importer, kind);

          let namespace: string | undefined;
          if (res.startsWith("file:")) namespace = "file";
          else if (res.startsWith("http:")) namespace = "http";
          else if (res.startsWith("https:")) namespace = "https";
          else if (res.startsWith("npm:")) namespace = "npm";
          else if (res.startsWith("jsr:")) namespace = "jsr";

          const resolved = res.startsWith("file:") ? path.fromFileUrl(res) : res;

          return {
            path: resolved,
            namespace,
            // The vendoring fix: restore esbuild's native package.json
            // sideEffects behaviour for resolved disk files.
            sideEffects: namespace === "file" ? fileSideEffects(resolved) : undefined,
          };
        } catch (err) {
          const couldNotResolveReg =
            /not a dependency and not in import map|Relative import path ".*?" not prefixed with/;
          if (err instanceof Error && couldNotResolveReg.test(err.message)) {
            return null;
          }
          throw err;
        }
      };

      // esbuild doesn't detect namespaces on entrypoints, so register a
      // catch-all plus one per namespace the loader can emit.
      ctx.onResolve({ filter: /.*/ }, onResolve);
      for (const ns of ["file", "http", "https", "data", "npm", "jsr"]) {
        ctx.onResolve({ filter: /.*/, namespace: ns }, onResolve);
      }

      const onLoad = async (
        args: OnLoadArgs,
      ): Promise<OnLoadResult | null> => {
        const url = args.path.startsWith("http:") ||
            args.path.startsWith("https:") ||
            args.path.startsWith("npm:") || args.path.startsWith("jsr:")
          ? args.path
          : path.toFileUrl(args.path).toString();

        const moduleType = getModuleType(args.path, args.with);
        const res = await loader.load(url, moduleType);
        if (res.kind === "external") return null;

        const esbuildLoader = mediaToLoader(res.mediaType);
        const envPrefix = options.publicEnvVarPrefix;
        if (envPrefix && moduleType === RequestedModuleType.Default) {
          let code = new TextDecoder().decode(res.code);
          code = code.replaceAll(
            /Deno\.env\.get\(["']([^)]+)['"]\)|process\.env\.([\w_-]+)/g,
            (m, name, processName) => {
              if (name !== undefined && name.startsWith(envPrefix)) {
                return JSON.stringify(Deno.env.get(name));
              }
              if (processName !== undefined && processName.startsWith(envPrefix)) {
                return JSON.stringify(Deno.env.get(processName));
              }
              return m;
            },
          );
          return { contents: code, loader: esbuildLoader };
        }

        return { contents: res.code, loader: esbuildLoader };
      };

      for (const ns of ["file", "jsr", "npm", "http", "https", "data"]) {
        ctx.onLoad({ filter: /.*/, namespace: ns }, onLoad);
      }
    },
  };
}
