import { Howl, staticFiles } from "@hushkey/howl";
import { vueEngine } from "@hushkey/howl-vue";
import type { State } from "../howl.config.ts";

export const app = new Howl<State>({
  logger: true,
  debug: true,
  engines: { vue: vueEngine() },
});

app.use((ctx) => {
  ctx.state.client = { title: "Vuety" };
  return ctx.next();
});

app.use(staticFiles());
app.fsClientRoutes();

export default { app };
