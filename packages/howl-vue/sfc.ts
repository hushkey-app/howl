import { compileScript, compileStyle, compileTemplate, parse } from "@vue/compiler-sfc";

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
