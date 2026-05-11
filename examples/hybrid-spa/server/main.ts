import { Howl, staticFiles } from "@hushkey/howl";
import { apiConfig, type State } from "../howl.config.ts";
// import { coalesceRequests, compression } from "@hushkey/howl/middleware";
import denoJson from "../../../packages/howl/deno.json" with { type: "json" };

const APP_NAME = Deno.env.get("APP_NAME") ?? "HOWL";
const APP_VERSION = denoJson.version;

export const app = new Howl<State>({
  logger: true,
  debug: true,
});
// middlewares
app.use((ctx) => {
  ctx.state.client = {
    title: APP_NAME,
    version: APP_VERSION,
  };

  return ctx.next();
});
app.use(staticFiles());
// app.use(compression());
// app.use(coalesceRequests());

// app.get("/docs", (ctx) => {
//   return ctx.redirect("/docs/getting-started");
// });

// fs endpoints
app.fsApiRoutes(apiConfig);
app.fsClientRoutes();

export default { app };
