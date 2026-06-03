import { Howl, staticFiles } from "@hushkey/howl";
import { reactEngine } from "@hushkey/howl-react";
import { coalesceRequests, compression } from "@hushkey/howl/middleware";
import { apiConfig, type State } from "../howl.config.ts";
import denoJson from "../deno.json" with { type: "json" };

const APP_NAME = Deno.env.get("APP_NAME") ?? "Software";
const APP_VERSION = denoJson.version;

export const app = new Howl<State>({
  logger: true,
  debug: true,
  engines: { react: reactEngine() },
});

app.use((ctx) => {
  ctx.state.client = {
    title: APP_NAME,
    version: APP_VERSION,
  };
  return ctx.next();
});

app.use(staticFiles());
app.use(compression());
app.use(coalesceRequests());

app.fsApiRoutes(apiConfig);
app.fsClientRoutes();

export default { app };
