import { compileScript, compileStyle, compileTemplate, parse, registerTS } from "@vue/compiler-sfc";

// Lazily-loaded TypeScript compiler. `@vue/compiler-sfc` needs it to resolve the
// types `defineProps<T>()` / `defineEmits<T>()` pull from **module** imports
// (bare specifiers / path aliases); relative-path types resolve without it.
// Loaded on demand (not at module top level) so the production server — which
// imports this file via the engine but never compiles `.vue` — never pays TS's
// load cost.
// deno-lint-ignore no-explicit-any
let tsModule: any = undefined;
registerTS(() => tsModule);

/**
 * Load the TypeScript compiler so {@linkcode compileSfc} can resolve imported
 * types in `defineProps<T>()` / `defineEmits<T>()`. Idempotent — await it before
 * compiling SFCs that reference types from module imports. A no-op if
 * `typescript` isn't installed (imported-type resolution then stays relative).
 */
export async function prepareTypeResolution(): Promise<void> {
  if (tsModule !== undefined) return;
  try {
    const mod = await import("typescript");
    // deno-lint-ignore no-explicit-any
    tsModule = (mod as any).default ?? mod;
  } catch {
    tsModule = null;
  }
}

/**
 * Result of compiling a single Vue Single-File Component.
 */
export interface CompiledSfc {
  /**
   * Generated ES module source. May contain TypeScript when the SFC uses
   * `<script lang="ts">` — the downstream bundler (esbuild) strips it.
   */
  code: string;
  /** Compiled CSS, one entry per `<style>` block in document order. */
  styles: string[];
  /** The scope id (`data-v-…`) applied when the SFC has scoped styles. */
  scopeId: string;
}

/**
 * Options controlling how a {@linkcode compileSfc} call emits code.
 */
export interface CompileSfcOptions {
  /**
   * Emit a server render function (`ssrRender`, for `@vue/server-renderer`)
   * instead of a browser render function. Defaults to `false` (client).
   */
  ssr?: boolean;
}

/**
 * Filesystem shim handed to `@vue/compiler-sfc`'s `compileScript` so it can
 * resolve **imported types** used in `defineProps<T>()` / `defineEmits<T>()`
 * (Vue walks the import graph to extract the prop shape). The compiler assumes a
 * Node `fs` and errors without this under Deno ("No fs option provided … in
 * non-Node environment"). Backed by Deno's synchronous file APIs.
 */
const denoFs = {
  fileExists(file: string): boolean {
    try {
      return Deno.statSync(file).isFile;
    } catch {
      return false;
    }
  },
  readFile(file: string): string | undefined {
    try {
      return Deno.readTextFileSync(file);
    } catch {
      return undefined;
    }
  },
  realpath(file: string): string {
    try {
      return Deno.realPathSync(file);
    } catch {
      return file;
    }
  },
};

/**
 * Deterministic short id derived from the file path — used as the scoped-style
 * marker so the same component always hashes to the same `data-v-…` attribute
 * across the server and client builds.
 */
function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).padStart(6, "0").slice(0, 8);
}

/**
 * Compile a `.vue` SFC source string into a loadable ES module plus its
 * extracted styles. Handles `<script setup>` (with the template inlined into
 * the SSR/client render), plain options-API `<script>`, template-only
 * components, TypeScript, and `<style scoped>`.
 *
 * Bare `vue` / `vue/server-renderer` imports are left intact for the bundler
 * to resolve — this is the build-time counterpart to the standalone spike.
 */
export function compileSfc(
  source: string,
  filename: string,
  options: CompileSfcOptions = {},
): CompiledSfc {
  const ssr = options.ssr ?? false;
  const { descriptor, errors } = parse(source, { filename });
  if (errors.length > 0) {
    throw new Error(
      `Failed to parse ${filename}:\n${errors.map((e) => String(e)).join("\n")}`,
    );
  }

  const id = hashId(filename);
  const scopeId = `data-v-${id}`;
  const hasScoped = descriptor.styles.some((s) => s.scoped);
  const renderFn = ssr ? "ssrRender" : "render";

  let code = "";

  if (descriptor.scriptSetup) {
    // `<script setup>`: compileScript inlines the template render into setup.
    const compiled = compileScript(descriptor, {
      id,
      fs: denoFs,
      inlineTemplate: descriptor.template !== null,
      templateOptions: {
        ssr,
        ssrCssVars: [],
        compilerOptions: { scopeId: hasScoped ? scopeId : undefined },
      },
    });
    code += compiled.content.replace("export default", "const __sfc__ =");
  } else {
    // Options API (or no script): component object + a separate render fn.
    code += descriptor.script
      ? descriptor.script.content.replace("export default", "const __sfc__ =")
      : "const __sfc__ = {};";

    if (descriptor.template) {
      const tpl = compileTemplate({
        source: descriptor.template.content,
        filename,
        id,
        ssr,
        ssrCssVars: [],
        scoped: hasScoped,
        compilerOptions: { scopeId: hasScoped ? scopeId : undefined },
      });
      if (tpl.errors.length > 0) {
        throw new Error(
          `Failed to compile template in ${filename}:\n${
            tpl.errors.map((e) => String(e)).join("\n")
          }`,
        );
      }
      code += "\n" +
        tpl.code.replace(`export function ${renderFn}`, `function ${renderFn}`);
      code += `\n__sfc__.${renderFn} = ${renderFn};`;
    }
  }

  if (hasScoped) {
    code += `\n__sfc__.__scopeId = ${JSON.stringify(scopeId)};`;
  }
  code += `\nexport default __sfc__;\n`;

  const styles = descriptor.styles.map((style) =>
    compileStyle({
      source: style.content,
      filename,
      id,
      scoped: style.scoped,
    }).code
  );

  return { code, styles, scopeId };
}
