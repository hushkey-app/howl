import { Howl, staticFiles } from "@hushkey/howl";
import { vueEngine } from "@hushkey/howl-vue";
import { apiConfig, type State } from "../howl.config.ts";

export const app = new Howl<State>({
  logger: true,
  debug: true,
  engines: { vue: vueEngine() },
});

app.use(staticFiles());

app.fsApiRoutes(apiConfig);
app.fsClientRoutes();

export default { app };
