import { Howl, staticFiles } from "@hushkey/howl";
import { vueEngine } from "@hushkey/howl-vue";
import { apiConfig, type State } from "../howl.config.ts";
// import denoJson from "../deno.json" with { type: "json" }; used for the version

export const app = new Howl<State>({
  logger: true,
  debug: true,
  engines: { vue: vueEngine() },
});

app.use(staticFiles());

app.use((ctx) => {
  // Theme is server-resolved from a cookie so _app.vue paints the right theme on
  // first byte — no flash, no hydration mismatch (the client toggle rewrites the
  // cookie). Anything other than "dark" defaults to light.
  const theme = ctx.cookies.get("theme") === "dark" ? "dark" : "light";
  ctx.state.client = { title: "kawaii(x,y) — Cute software that works.", theme };

  return ctx.next();
});

app.fsApiRoutes(apiConfig);
app.fsClientRoutes();

export default { app };
