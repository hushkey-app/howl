/**
 * Spike: full Vue *page* — SSR first paint (crawlable SEO, zero JS needed to
 * see content) then client hydration to a live SPA. Proves the universal-SSR
 * model the real Howl-vue page engine will use.
 *
 * Run: deno run -A spikes/vue-page/server.ts   (serves http://127.0.0.1:8125)
 */
import { compileSfc } from "../../packages/howl-vue/sfc.ts";
import { createSSRApp } from "npm:vue@^3.5.13";
import { renderToString } from "npm:vue@^3.5.13/server-renderer";
import * as esbuild from "npm:esbuild@^0.25.0";

const NPM_VUE = "npm:vue@^3.5.13";
const ESM_VUE = "https://esm.sh/vue@3.5.13";
const here = new URL(".", import.meta.url);

/** Point bare `vue` imports at a resolvable specifier (npm for server, CDN for browser). */
function rewrite(code: string, target: string): string {
  return code
    .replaceAll('from "vue/server-renderer"', `from "${target}/server-renderer"`)
    .replaceAll("from 'vue/server-renderer'", `from "${target}/server-renderer"`)
    .replaceAll('from "vue"', `from "${target}"`)
    .replaceAll("from 'vue'", `from "${target}"`);
}

const src = await Deno.readTextFile(new URL("App.vue", here));

// Server: compile for SSR, write a sibling .ts so Deno resolves npm imports, load it.
const ssr = compileSfc(src, "App.vue", { ssr: true });
const ssrFile = new URL("_App.ssr.ts", here);
await Deno.writeTextFile(ssrFile, rewrite(ssr.code, NPM_VUE));
const { default: AppSSR } = await import(ssrFile.href);

// Browser: compile for client render, strip TS (esbuild does this in the real
// pipeline), and serve as an ES module (vue from a CDN).
const clientTs = rewrite(compileSfc(src, "App.vue", { ssr: false }).code, ESM_VUE);
const clientJs = (await esbuild.transform(clientTs, { loader: "ts" })).code;
await esbuild.stop();

const PROPS = {
  title: "Vue page: SSR + hydrate",
  description: "Server-rendered for SEO, then hydrated into a live Vue SPA.",
  start: 0,
};

console.log("Serving http://127.0.0.1:8125");
Deno.serve({ port: 8125, hostname: "127.0.0.1" }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/App.js") {
    return new Response(clientJs, {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  }
  // Vue SSR of the page tree → crawlable HTML inside #app.
  const appHtml = await renderToString(createSSRApp(AppSSR, PROPS));
  const html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${PROPS.title}</title>` +
    `<meta name="description" content="${PROPS.description}"></head>` +
    `<body><div id="app">${appHtml}</div>` +
    `<script>window.__PROPS__=${JSON.stringify(PROPS)}</script>` +
    `<script type="module">import { createSSRApp } from "${ESM_VUE}";` +
    `import App from "/App.js";createSSRApp(App, window.__PROPS__).mount("#app");</script>` +
    `</body></html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
