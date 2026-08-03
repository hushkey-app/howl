import { Howl, staticFiles } from "@hushkey/howl";
import { compression } from "@hushkey/howl/middleware";
import { reactEngine } from "@hushkey/howl-react";
import type { State } from "../howl.config.ts";
import { APP_STORE_URL, PRICE } from "../shared/facts.ts";

const APP_NAME = Deno.env.get("APP_NAME") ?? "Nobiru";
const APP_VERSION = "1.0";

export const app = new Howl<State>({
  logger: true,
  debug: true,
  engines: { react: reactEngine() },
});

app.use(staticFiles());
app.use(compression());

app.use((ctx) => {
  ctx.state.client = {
    title: APP_NAME,
    version: APP_VERSION,
    appStoreUrl: APP_STORE_URL,
    price: PRICE,
  };
  return ctx.next();
});

app.fsClientRoutes();

export default { app };
