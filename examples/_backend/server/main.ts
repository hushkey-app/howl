import { Howl, staticFiles } from "@hushkey/howl";
import { apiConfig, type State } from "../howl.config.ts";
// import denoJson from "../deno.json" with { type: "json" }; used for the version

export const app = new Howl<State>({
  logger: true,
  debug: true,
});

app.use(staticFiles());

app.get("/", (ctx) => {
  return ctx.html("<h1>HELLO WORLD</h1>");
});

app.fsApiRoutes(apiConfig);

export default { app };
