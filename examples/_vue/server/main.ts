import { Howl, staticFiles } from "@hushkey/howl";
import { vueEngine } from "@hushkey/howl-vue";
import { apiConfig, type State } from "../howl.config.ts";
// import denoJson from "../deno.json" with { type: "json" }; used for the version

export const app: Howl<State> = new Howl<State>({
  logger: true,
  debug: true,
  engines: { vue: vueEngine() },
});

app.use(staticFiles());

app.use((ctx) => {
  ctx.state.client = { title: "HUSHKEY - Vuety" };
  ctx.state.user = { first_name: "leo", last_name: "termine" };
  ctx.headers.append("X-HOWL-TEST", "true");
  ctx.cookies.delete("lang");
  // console.log(ctx);
  return ctx.next();
});

// redirect test from backend SPA style hydration + history.push
// app.use("/about", (ctx) => {
//   if (ctx.url.pathname === "/about") {
//     return ctx.redirect("/about/1999", 302);
//   }
//   return ctx.next();
// });

app.fsApiRoutes(apiConfig);
app.fsClientRoutes();

export default { app };
