import { expect } from "@std/expect";
import * as path from "@std/path";
import * as esbuild from "esbuild";
import { denoPlugin } from "../../dev/deno_esbuild_plugin.ts";

const USED = "USED_MARKER_4F2A";
const UNUSED = "UNUSED_MARKER_9C7B";

/**
 * Build a fixture workspace whose barrel re-exports a used and an unused
 * module, then bundle an entry that imports only the used one. Each leaf module
 * is `const x = make(marker)` — a top-level call esbuild cannot prove pure on
 * its own (mirroring lucide's `createLucideIcon(...)`), so the module survives
 * unless the package's `package.json` marks it side-effect-free. Returns the
 * minified output text so the caller can assert which markers survived.
 */
async function bundleFixture(sideEffects: unknown): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "howl-shake-" });
  try {
    const pkgJson: Record<string, unknown> = { name: "barrelpkg", version: "1.0.0" };
    if (sideEffects !== undefined) pkgJson.sideEffects = sideEffects;

    const files: Record<string, string> = {
      "deno.json": JSON.stringify({ imports: {} }),
      "entry.js": `import { used } from "./pkg/index.js";\nglobalThis.__x = used;\n`,
      "pkg/package.json": JSON.stringify(pkgJson),
      "pkg/make.js": `export function make(tag) {\n  return { tag, at: globalThis.performance?.now?.() };\n}\n`,
      "pkg/index.js":
        `export { used } from "./used.js";\nexport { unused } from "./unused.js";\n`,
      "pkg/used.js": `import { make } from "./make.js";\nexport const used = make(${JSON.stringify(USED)});\n`,
      "pkg/unused.js": `import { make } from "./make.js";\nexport const unused = make(${JSON.stringify(UNUSED)});\n`,
    };
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      await Deno.mkdir(path.dirname(abs), { recursive: true });
      await Deno.writeTextFile(abs, body);
    }

    const result = await esbuild.build({
      entryPoints: [path.join(dir, "entry.js")],
      absWorkingDir: dir,
      platform: "browser",
      format: "esm",
      bundle: true,
      treeShaking: true,
      minify: true,
      write: false,
      plugins: [denoPlugin({ configPath: path.join(dir, "deno.json") })],
    });

    return new TextDecoder().decode(result.outputFiles[0].contents);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("denoPlugin surfaces package.json sideEffects:false so barrels tree-shake", async () => {
  const out = await bundleFixture(false);
  expect(out).toContain(USED);
  expect(out).not.toContain(UNUSED);
});

Deno.test("denoPlugin honours a sideEffects glob array (non-matching file shakes)", async () => {
  const out = await bundleFixture(["**/*.css"]);
  expect(out).toContain(USED);
  expect(out).not.toContain(UNUSED);
});

Deno.test("a matching sideEffects glob keeps the module (side-effectful)", async () => {
  const out = await bundleFixture(["**/*.js"]);
  expect(out).toContain(USED);
  expect(out).toContain(UNUSED);
});

Deno.test("without sideEffects, esbuild conservatively keeps the unused re-export", async () => {
  const out = await bundleFixture(undefined);
  expect(out).toContain(USED);
  expect(out).toContain(UNUSED);
});

Deno.test("stop esbuild service", async () => {
  await esbuild.stop();
});
