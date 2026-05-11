import { Howl, staticFiles } from "@hushkey/howl";
import { apiConfig, type State } from "../howl.config.ts";

const APP_NAME = Deno.env.get("APP_NAME") ?? "{{PROJECT_NAME}}";

export const app = new Howl<State>({
  logger: true,
});

// Seed request-scoped state. Anything in ctx.state is also exposed in
// window.__HOWL_USER_STATE__ on AOT/SSG responses, so keep it public-safe.
app.use((ctx) => {
  ctx.state.client = {
    title: "AOT SPA",
    appName: APP_NAME,
  };
  return ctx.next();
});

app.use(staticFiles());

app.fsApiRoutes(apiConfig);
app.fsClientRoutes();

export default { app };
