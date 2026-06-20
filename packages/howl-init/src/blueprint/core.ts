import { engineOf, isFullstack, type ProjectSpec } from "../spec.ts";
import { HOWL_VERSION } from "../versions.ts";

/** Build the `deno.json` object for a project, composed from its spec. */
export function denoJson(spec: ProjectSpec): string {
  const engine = engineOf(spec.appType);
  const fullstack = isFullstack(spec);

  const imports: Record<string, string> = {
    "@hushkey/howl": `jsr:@hushkey/howl@^${HOWL_VERSION}`,
    // Alias so client pages can `import { State } from "@howl/config"` without
    // brittle relative paths up out of client/.
    "@howl/config": "./howl.config.ts",
    "zod": "npm:zod@4.3.6",
    "@std/path": "jsr:@std/path@^1.0.0",
  };

  if (engine === "react") {
    imports["@hushkey/howl-react"] = `jsr:@hushkey/howl-react@^${HOWL_VERSION}`;
    imports["react"] = "npm:react@^19.1.0";
    imports["react/jsx-runtime"] = "npm:react@^19.1.0/jsx-runtime";
    imports["react-dom"] = "npm:react-dom@^19.1.0";
    imports["react-dom/server"] = "npm:react-dom@^19.1.0/server";
    imports["react-dom/client"] = "npm:react-dom@^19.1.0/client";
  } else if (engine === "vue") {
    imports["@hushkey/howl-vue"] = `jsr:@hushkey/howl-vue@^${HOWL_VERSION}`;
    imports["vue"] = "npm:vue@^3.5.13";
    imports["vue/server-renderer"] = "npm:vue@^3.5.13/server-renderer";
    imports["@vue/runtime-dom"] = "npm:@vue/runtime-dom@^3.5.13";
  }

  if (fullstack) {
    imports["tailwindcss"] = "npm:tailwindcss@4.1.18";
    if (spec.ui === "daisyui") imports["daisyui"] = "npm:daisyui@5.5.18";
    if (spec.ui === "shadcn") {
      imports["@/"] = "./client/";
      imports["class-variance-authority"] = "npm:class-variance-authority@^0.7.1";
      imports["clsx"] = "npm:clsx@^2.1.1";
      imports["tailwind-merge"] = "npm:tailwind-merge@^3.3.1";
      imports["lucide-react"] = "npm:lucide-react@^0.468.0";
      imports["@radix-ui/react-slot"] = "npm:@radix-ui/react-slot@^1.1.2";
    }
  }

  if (spec.service !== "none") {
    imports["@hushkey/service-core"] = `jsr:@hushkey/service-core@^${HOWL_VERSION}`;
    imports["@hushkey/studio"] = `jsr:@hushkey/studio@^${HOWL_VERSION}`;
    if (spec.service === "sqlite") {
      imports["@hushkey/sqlite-service"] = `jsr:@hushkey/sqlite-service@^${HOWL_VERSION}`;
    } else if (spec.service === "postgres") {
      imports["@hushkey/pg-service"] = `jsr:@hushkey/pg-service@^${HOWL_VERSION}`;
      imports["pg"] = "npm:pg@^8.13.0";
      imports["@electric-sql/pglite"] = "npm:@electric-sql/pglite@^0.2.0";
    } else if (spec.service === "mongo") {
      imports["@hushkey/mongo-service"] = `jsr:@hushkey/mongo-service@^${HOWL_VERSION}`;
      imports["mongodb"] = "npm:mongodb@^6.0.0";
    }
  }

  const include = fullstack ? "--include dist/static " : "";
  // Dirs the dev watcher must ignore, or the build's own output (and the local
  // SQLite/pglite `data/` dir, written on every query) trigger an endless
  // restart loop. Mirrors the .gitignore set.
  const watchExclude = ["dist/", "node_modules/", "data/", "generated/"];
  const compilerOptions: Record<string, unknown> = {
    lib: ["dom", "dom.iterable", "deno.ns", "deno.unstable"],
  };
  if (engine !== null) {
    compilerOptions.jsx = "react-jsx";
    compilerOptions.jsxImportSource = engine === "react" ? "react" : "vue";
    if (engine === "react") compilerOptions.jsxImportSourceTypes = "npm:@types/react@^19.1.0";
  }

  // An app, not a publishable package — no `name`/`version`/`exports`, which
  // would otherwise make `deno lint` enable JSR slow-type rules (every
  // `export const app = new Howl(...)` would need an explicit type) and warn on
  // a name without exports. The compile task embeds the project name directly.
  const obj = {
    tasks: {
      dev: `deno run -A --watch=. --watch-exclude=${watchExclude.join(",")} dev.ts`,
      build: "deno run -A dev.ts build",
      start: "deno run -A dist/compiled-entry.js",
      compile: `deno compile -A ${include}--output dist/bin/${spec.name} dist/compiled-entry.js`,
    },
    imports,
    compilerOptions,
  };

  return JSON.stringify(obj, null, 2) + "\n";
}

/** Build `dev.ts` — wires HowlBuilder with the engine plugin (fullstack),
 * tailwind (fullstack), and the http-client generator (always). */
export function devTs(spec: ProjectSpec): string {
  const engine = engineOf(spec.appType);
  const fullstack = isFullstack(spec);
  const lines: string[] = [
    `import { HowlBuilder } from "@hushkey/howl/dev";`,
  ];
  if (engine === "react") lines.push(`import { reactPlugin } from "@hushkey/howl-react/plugin";`);
  if (engine === "vue") lines.push(`import { vuePlugin } from "@hushkey/howl-vue/plugin";`);
  const pluginImports = fullstack
    ? `import { httpClientGenPlugin, tailwindPlugin } from "@hushkey/howl/plugins";`
    : `import { httpClientGenPlugin } from "@hushkey/howl/plugins";`;
  lines.push(pluginImports);
  lines.push(`import { app } from "./server/main.ts";`);
  lines.push(`import type { State } from "./howl.config.ts";`);
  lines.push("");
  lines.push(`const DENO_PORT = Number(Deno.env.get("DENO_PORT") ?? "8000");`);
  lines.push(`const DENO_HOSTNAME = Deno.env.get("DENO_HOSTNAME") ?? "127.0.0.1";`);
  lines.push("");
  lines.push(`const builder = new HowlBuilder<State>(app, {`);
  lines.push(`  root: import.meta.dirname ?? "",`);
  lines.push(`  importApp: () => app,`);
  lines.push(`  outDir: "dist",`);
  lines.push(`  serverEntry: "./server/main.ts",`);
  if (engine === "react") lines.push(`  clientEntry: "./client/pages/_app.tsx",`);
  if (engine === "vue") lines.push(`  clientEntry: "./client/pages/_app.vue",`);
  lines.push(`  plugins: [`);
  if (engine === "react") lines.push(`    reactPlugin(),`);
  if (engine === "vue") lines.push(`    vuePlugin(),`);
  lines.push(`    httpClientGenPlugin({`);
  lines.push(`      apiDir: "server/apis",`);
  lines.push(`      outputFile: "./generated/http-client.ts",`);
  lines.push(`      aliases: { "@server/": "server/" },`);
  lines.push(`    }),`);
  lines.push(`  ],`);
  lines.push(`});`);
  lines.push("");
  if (fullstack) {
    lines.push(`tailwindPlugin(builder.getBuilder("default")!);`);
    lines.push("");
  }
  lines.push(`if (Deno.args.includes("build")) {`);
  lines.push(`  await builder.build();`);
  lines.push(`} else {`);
  lines.push(`  await builder.listen({ port: DENO_PORT, hostname: DENO_HOSTNAME });`);
  lines.push(`}`);
  return lines.join("\n") + "\n";
}

/** Build `server/main.ts` — engine registration, Studio (service), routes. */
export function mainTs(spec: ProjectSpec): string {
  const engine = engineOf(spec.appType);
  const fullstack = isFullstack(spec);
  const lines: string[] = [
    `import { Howl, staticFiles } from "@hushkey/howl";`,
  ];
  if (engine === "react") lines.push(`import { reactEngine } from "@hushkey/howl-react";`);
  if (engine === "vue") lines.push(`import { vueEngine } from "@hushkey/howl-vue";`);
  if (spec.service !== "none") {
    lines.push(`import { studio } from "@hushkey/studio";`);
    lines.push(`import { itemsService } from "./services/items/items.service.ts";`);
  }
  lines.push(`import { apiConfig, type State } from "../howl.config.ts";`);
  lines.push("");
  lines.push(`export const app = new Howl<State>({`);
  lines.push(`  logger: true,`);
  if (engine === "react") lines.push(`  engines: { react: reactEngine() },`);
  if (engine === "vue") lines.push(`  engines: { vue: vueEngine() },`);
  lines.push(`});`);
  lines.push("");
  lines.push(`app.use(staticFiles());`);
  lines.push("");
  lines.push(`app.use((ctx) => {`);
  lines.push(`  ctx.state.title = "${spec.name}";`);
  lines.push(`  return ctx.next();`);
  lines.push(`});`);
  lines.push("");
  if (spec.service !== "none") {
    lines.push(`// Admin dashboard at /studio, speaking the service contract.`);
    lines.push(`app.use(studio({ services: { items: itemsService } }));`);
    lines.push("");
  }
  if (!fullstack) {
    lines.push(`app.get("/", (ctx) =>`);
    lines.push(
      `  ctx.json({ ok: true, message: "${spec.name} is running — try /api/public/ping" }));`,
    );
    lines.push("");
  }
  lines.push(`app.fsApiRoutes(apiConfig);`);
  if (fullstack) lines.push(`app.fsClientRoutes();`);
  lines.push("");
  lines.push(`export default { app };`);
  return lines.join("\n") + "\n";
}

/** `howl.config.ts` — State, roles, and the pre-typed `defineApi` factory. */
export function howlConfigTs(_spec: ProjectSpec): string {
  return `import { defineConfig } from "@hushkey/howl/api";

/** Per-request state shared across middleware and handlers. */
export interface State {
  /** App title, surfaced on pages via ctx.state. */
  title: string;
}

export const roles = ["USER"] as const;
export type Role = typeof roles[number];

export const { defineApi, config: apiConfig } = defineConfig<State, Role>({
  roles,
});
`;
}

/** Sample `server/apis/public/ping.api.ts` — GET with caching + rate limit. */
export function pingApiTs(): string {
  return `import { z } from "zod";
import { defineApi } from "../../../howl.config.ts";

export default defineApi({
  name: "Ping",
  directory: "public",
  method: "GET",
  roles: [],
  rateLimit: { max: 30, windowMs: 60_000 },
  caching: { ttl: 5 },
  responses: {
    200: z.object({
      ok: z.boolean(),
      message: z.string(),
    }),
  },
  handler: () => ({
    statusCode: 200,
    ok: true,
    message: \`pong — \${new Date().toISOString()}\`,
  }),
});
`;
}

/** `.gitignore` — build output, generated client, and any local DB files. */
export function gitignore(spec: ProjectSpec): string {
  const lines = ["dist/", "node_modules/", "generated/", ".env", ".DS_Store"];
  if (spec.service === "sqlite" || spec.service === "postgres") lines.push("data/");
  return lines.join("\n") + "\n";
}

/** `.env.example` — the env vars the project reads. */
export function envExample(spec: ProjectSpec): string {
  const lines = ["DENO_PORT=8000", "DENO_HOSTNAME=127.0.0.1"];
  if (spec.service === "postgres") {
    lines.push("# Postgres connection — omit to use the embedded PGlite fallback");
    lines.push("# PG_URL=postgres://user:pass@localhost:5432/db");
  }
  if (spec.service === "mongo") {
    lines.push("MONGO_URL=mongodb://localhost:27017");
  }
  return lines.join("\n") + "\n";
}
