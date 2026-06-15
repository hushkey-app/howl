import { HowlBuilder } from "@hushkey/howl/dev";
import { vuePlugin } from "@hushkey/howl-vue/plugin";
import { tailwindPlugin } from "@hushkey/howl/plugins";
import { app } from "./server/main.ts";
import type { State } from "./howl.config.ts";

const DENO_PORT = Number(Deno.env.get("DENO_PORT") ?? "3002");
const DENO_HOSTNAME = Deno.env.get("DENO_HOSTNAME") ?? "127.0.0.1";

const builder = new HowlBuilder<State>(app, {
  root: import.meta.dirname ?? "",
  importApp: () => app,
  outDir: "dist",
  serverEntry: "./server/main.ts",
  clientEntry: "./client/pages/_app.vue",
  plugins: [vuePlugin()],
});

tailwindPlugin(builder.getBuilder("default")!);

if (Deno.args.includes("build")) {
  await builder.build();
} else {
  await builder.listen({ port: DENO_PORT, hostname: DENO_HOSTNAME });
}
