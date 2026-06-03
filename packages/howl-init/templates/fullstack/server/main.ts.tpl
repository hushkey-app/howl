import { Howl, staticFiles } from "@hushkey/howl";
import { preactEngine } from "@hushkey/howl-preact";
import { coalesceRequests, compression } from "@hushkey/howl/middleware";
import { apiConfig, type State } from "../howl.config.ts";

const APP_NAME = Deno.env.get("APP_NAME") ?? "{{PROJECT_NAME}}";

export const app = new Howl<State>({
  logger: true,
  debug: true,
  engines: { preact: preactEngine() },
});

app.use((ctx) => {
  ctx.state.client = { title: APP_NAME };
  return ctx.next();
});

app.use(staticFiles());
app.use(compression());
app.use(coalesceRequests());

app.fsApiRoutes(apiConfig);
app.fsClientRoutes();

export default { app };
