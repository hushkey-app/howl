import { HowlBuilder } from "@hushkey/howl/dev";
import { reactPlugin } from "@hushkey/howl-react/plugin";
import { tailwindPlugin } from "@hushkey/howl/plugins";
import { app } from "./server/main.ts";
import type { State } from "./howl.config.ts";

const DENO_PORT = Number(Deno.env.get("DENO_PORT") ?? "8000");
const DENO_HOSTNAME = Deno.env.get("DENO_HOSTNAME") ?? "127.0.0.1";

const builder = new HowlBuilder<State>(app, {
  root: import.meta.dirname ?? "",
  importApp: () => app,
  outDir: "dist",
  serverEntry: "./server/main.ts",
  clientEntry: "./client/pages/_app.tsx",
  // Mirrors vuety's `plugins: [vuePlugin()]` — registering reactPlugin() is the
  // only wiring needed: it tells Howl that `.tsx` routes render with React.
  plugins: [reactPlugin()],
});

tailwindPlugin(builder.getBuilder("default")!);

if (Deno.args.includes("build")) {
  await builder.build();
} else {
  await builder.listen({ port: DENO_PORT, hostname: DENO_HOSTNAME });
}
