import { Howl, staticFiles } from "@hushkey/howl";
import { reactEngine } from "@hushkey/howl-react";
import type { State } from "../howl.config.ts";

export const app: Howl<State> = new Howl<State>({
  logger: true,
  engines: { react: reactEngine() },
});

app.use(staticFiles());

app.use((ctx) => {
  ctx.state.title = "Howl · React";
  ctx.cookies.set("hello", "react");
  return ctx.next();
});

app.fsClientRoutes();

export default { app };
