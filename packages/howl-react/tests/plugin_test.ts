import { expect } from "@std/expect";
import { reactPlugin } from "../plugin.ts";

const HOWL_ENGINE = Symbol.for("howl.engine");

Deno.test("reactPlugin — declares the .tsx/.jsx → react engine mapping", () => {
  const plugin = reactPlugin();
  expect(plugin.name).toBe("howl-react");
  // deno-lint-ignore no-explicit-any
  const decl = (plugin as any)[HOWL_ENGINE];
  expect(decl).toEqual({ extensions: [".tsx", ".jsx"], engine: "react" });
});

Deno.test("reactPlugin — sets esbuild to automatic React JSX on setup", () => {
  const plugin = reactPlugin();
  const initialOptions: Record<string, unknown> = {};
  // Minimal esbuild PluginBuild stub — only initialOptions is touched.
  // deno-lint-ignore no-explicit-any
  plugin.setup({ initialOptions } as any);
  expect(initialOptions.jsx).toBe("automatic");
  expect(initialOptions.jsxImportSource).toBe("react");
});
