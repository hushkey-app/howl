import { HowlBuilder } from "@hushkey/howl/dev";
import { app } from "./server/main.ts";
import type { State } from "./howl.config.ts";
import { httpClientGenPlugin } from "@hushkey/howl/plugins";

const DENO_PORT = Number(Deno.env.get("DENO_PORT") ?? "8000");
const DENO_HOSTNAME = Deno.env.get("DENO_HOSTNAME") ?? "127.0.0.1";

const builder = new HowlBuilder<State>(app, {
  root: import.meta.dirname ?? "",
  importApp: () => app,
  outDir: "dist",
  serverEntry: "./server/main.ts",
  plugins: [
    httpClientGenPlugin({
      apiDir: "server/apis",
      outputFile: "./generated/http-client.ts",
      aliases: {
        "@server/": "server/",
      },
    }),
  ],
  // The only wiring needed for Vue islands: register the SFC esbuild plugin.
});

if (Deno.args.includes("build")) {
  await builder.build();
} else {
  await builder.listen({ port: DENO_PORT, hostname: DENO_HOSTNAME });
}
