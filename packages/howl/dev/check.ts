import * as JSONC from "@std/jsonc";
import * as path from "@std/path";

/** Subset of a parsed `deno.json(c)` the build pipeline inspects. */
export interface DenoConfig {
  /** Workspace member globs, when the config is a workspace root. */
  workspace?: string[];
  /** Compiler options relevant to JSX transpilation. */
  compilerOptions?: {
    /** JSX transform mode (e.g. `react-jsx`, `precompile`). */
    jsx?: string;
    /** Module providing the JSX runtime. */
    jsxImportSource?: string;
    /** Elements excluded from the precompile transform. */
    jsxPrecompileSkipElements?: string[];
  };
}

/**
 * Resolve the nearest `deno.json(c)` and validate its JSX compiler options.
 *
 * `requireJsx` is set when the client bundle actually contains `.tsx`/`.jsx`
 * routes (React engine). Engine-less or Vue-only projects don't transpile any
 * JSX in the browser bundle, so they only need the config file itself (esbuild
 * reads its import map) — `jsxImportSource` stays optional for them.
 */
export async function checkDenoCompilerOptions(
  root: string,
  requireJsx: boolean,
): Promise<{ jsxImportSource: string | undefined; denoJson: string }> {
  const denoJson = await findNearestDenoConfig(root, requireJsx);

  const jsxImportSource = denoJson.config.compilerOptions?.jsxImportSource;
  if (requireJsx) {
    if (jsxImportSource === undefined) {
      throw new Error(
        `Option compilerOptions > jsxImportSource not set in: ${denoJson.filePath}\n` +
          `It is required because the project has .tsx/.jsx page routes.`,
      );
    }

    // Check precompile option
    if (denoJson.config.compilerOptions?.jsx === "precompile") {
      const expected = [
        "a",
        "img",
        "source",
        "body",
        "html",
        "head",
        "title",
        "meta",
        "script",
        "link",
        "style",
        "base",
        "noscript",
        "template",
      ];
      const skipped = denoJson.config.compilerOptions.jsxPrecompileSkipElements;
      if (!skipped || expected.some((name) => !skipped.includes(name))) {
        throw new Error(
          `Expected option compilerOptions > jsxPrecompileSkipElements to contain ${
            expected.map((name) => `"${name}"`).join(", ")
          }`,
        );
      }
    }
  }

  return { jsxImportSource, denoJson: denoJson.filePath };
}

/**
 * Walk up from `directory` to the nearest `deno.json` / `deno.jsonc`.
 *
 * Prefers the closest config carrying a `compilerOptions` field; when none in
 * the chain has one and `requireCompilerOptions` is false, falls back to the
 * closest config file found (the build still needs its path for esbuild's
 * import-map resolution).
 */
export async function findNearestDenoConfig(
  directory: string,
  requireCompilerOptions: boolean,
): Promise<{ config: DenoConfig; filePath: string }> {
  let fallback: { config: DenoConfig; filePath: string } | null = null;

  let dir = directory;
  while (true) {
    for (const name of ["deno.json", "deno.jsonc"]) {
      const filePath = path.join(dir, name);
      try {
        const file = await Deno.readTextFile(filePath);
        const config =
          (name.endsWith(".jsonc") ? JSONC.parse(file) : JSON.parse(file)) as DenoConfig;
        if (config.compilerOptions) return { config, filePath };
        fallback ??= { config, filePath };
        break;
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
          throw err;
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (!requireCompilerOptions && fallback !== null) return fallback;

  throw new Error(
    requireCompilerOptions
      ? `Could not find a deno.json or deno.jsonc file in the current directory or any parent directory that contains a 'compilerOptions' field.`
      : `Could not find a deno.json or deno.jsonc file in the current directory or any parent directory.`,
  );
}
