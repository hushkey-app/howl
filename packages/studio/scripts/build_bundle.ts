/**
 * Prebuild the standalone studio browser bundle: esbuild
 * `component/entry.tsx` → `component/bundle.js`, with React externalized to the
 * import map the standalone page injects.
 *
 * Run before `deno publish` (and the output committed) so the middleware can
 * serve the bundle with **no esbuild at runtime**. Bundling on first request
 * only worked when studio's source was local `file://`; consumed from JSR
 * `import.meta.url` is an `https:` URL, which esbuild can neither read a `.tsx`
 * from, nor be safely stopped against — its service is a process-global
 * singleton shared with the host app's dev pipeline.
 *
 * @module
 */
import * as esbuild from "esbuild";
import { fromFileUrl } from "@std/path";

const entry = fromFileUrl(new URL("../component/entry.tsx", import.meta.url));
const outfile = fromFileUrl(new URL("../component/bundle.js", import.meta.url));

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  jsx: "automatic",
  jsxImportSource: "react",
  // React stays external — the standalone page maps it to esm.sh via an import
  // map, so only the studio's own TSX is transpiled here.
  external: ["react", "react/jsx-runtime", "react-dom/client"],
  write: false,
  minify: true,
});
await esbuild.stop();

const code = result.outputFiles![0].text;
await Deno.writeTextFile(outfile, code);
console.log(`studio bundle → ${outfile} (${code.length} bytes)`);
