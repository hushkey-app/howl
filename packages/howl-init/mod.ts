import { parseArgs } from "@std/cli/parse-args";
import { isAbsolute, join, resolve } from "@std/path";
import { PromptCancelled, type PromptDeps, ttyPrompt } from "./src/prompt.ts";
import {
  type AppType,
  gatherSpec,
  isFullstack,
  type ProjectSpec,
  type ServiceLayer,
  type UiKit,
} from "./src/spec.ts";
import { scaffold } from "./src/scaffold.ts";

/** Inputs to {@link runInit}. All fields optional — missing ones are prompted. */
export interface RunInitOptions {
  /** Project name — becomes the target folder (relative to `cwd`) and `deno.json#name`. */
  name?: string;
  /** App type — `backend`, `fullstack-react`, or `fullstack-vue`. */
  appType?: AppType;
  /** UI kit (fullstack only) — `tailwind`, `daisyui`, or `shadcn`. */
  ui?: UiKit;
  /** Service layer — `none`, `sqlite`, `postgres`, or `mongo`. */
  service?: ServiceLayer;
  /** Working directory the project folder is created under. Defaults to `Deno.cwd()`. */
  cwd?: string;
  /** Prompt implementation. Defaults to {@link ttyPrompt}; tests inject a fake. */
  prompt?: PromptDeps;
  /**
   * Progress callback fired once per file written. Defaults to a TTY progress
   * bar when stdout is a terminal; pass `undefined` explicitly to silence.
   */
  onProgress?: (progress: { current: number; total: number; file: string }) => void;
  /**
   * Run `deno fmt` over the generated project so the output is idiomatic.
   * Best-effort — a missing `deno` binary or fmt error is ignored. Default
   * `true`; tests pass `false` to stay fast and subprocess-free.
   */
  format?: boolean;
}

/** Outcome of a successful init run. */
export interface RunInitResult {
  /** Absolute path of the created project directory. */
  path: string;
  /** The fully-resolved spec used to scaffold the project. */
  spec: ProjectSpec;
}

/**
 * Programmatic entry — resolves a full spec from the given options (prompting
 * for anything missing) and scaffolds the project. Tests should pass explicit
 * `name`, `appType`, `ui`, `service`, and `cwd` so no prompts run.
 */
export async function runInit(opts: RunInitOptions = {}): Promise<RunInitResult> {
  const prompts = opts.prompt ?? ttyPrompt;
  const cwd = opts.cwd ?? Deno.cwd();

  const spec = gatherSpec(
    { name: opts.name, appType: opts.appType, ui: opts.ui, service: opts.service },
    prompts,
  );

  const targetDir = isAbsolute(spec.name) ? spec.name : resolve(join(cwd, spec.name));
  const progress = opts.onProgress ?? (Deno.stdout.isTerminal() ? ttyProgress() : undefined);

  await scaffold({ spec, targetDir, onProgress: progress });

  if (opts.format !== false) await tryFormat(targetDir);

  return { path: targetDir, spec };
}

/**
 * Best-effort `deno fmt` over the generated project so files match the
 * formatter regardless of template whitespace. Swallows failures (no `deno`
 * on PATH, fmt error) — the files are already valid, just unformatted.
 */
async function tryFormat(dir: string): Promise<void> {
  try {
    await new Deno.Command("deno", {
      args: ["fmt", dir],
      stdout: "null",
      stderr: "null",
    }).output();
  } catch {
    // leave the files as written
  }
}

function ttyProgress(): (p: { current: number; total: number; file: string }) => void {
  const encoder = new TextEncoder();
  let lastLineLength = 0;

  return ({ current, total, file }) => {
    const pct = Math.round((current / total) * 100);
    const barWidth = 24;
    const filled = Math.round((current / total) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    const counter = `${current.toString().padStart(total.toString().length)}/${total}`;
    const truncated = file.length > 40 ? "…" + file.slice(-39) : file;
    const line = `  [${bar}] ${pct.toString().padStart(3)}%  ${counter}  ${truncated}`;

    const padded = line.padEnd(lastLineLength);
    lastLineLength = line.length;
    Deno.stdout.writeSync(encoder.encode(`\r${padded}`));

    if (current === total) Deno.stdout.writeSync(encoder.encode("\n"));
  };
}

/** CLI entry — parses argv, calls {@link runInit}, prints next-steps on success. */
export async function main(argv: string[] = Deno.args): Promise<void> {
  const flags = parseArgs(argv, {
    string: ["name", "type", "ui", "service"],
    boolean: ["help"],
    alias: { h: "help", n: "name", t: "type", u: "ui", s: "service" },
  });

  if (flags.help) {
    printHelp();
    return;
  }

  const positional = flags._[0]?.toString();
  try {
    const result = await runInit({
      name: flags.name ?? positional,
      appType: flags.type as AppType | undefined,
      ui: flags.ui as UiKit | undefined,
      service: flags.service as ServiceLayer | undefined,
    });
    printNextSteps(result);
  } catch (err) {
    if (err instanceof PromptCancelled) {
      console.error("\nhowl-init: cancelled — no project created.");
      Deno.exit(130);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`howl-init: ${msg}`);
    Deno.exit(1);
  }
}

function printHelp(): void {
  console.log(
    [
      "howl-init — scaffold a new Howl project",
      "",
      "Usage:",
      "  deno run -Ar jsr:@hushkey/howl-init [name] [flags]",
      "",
      "Flags:",
      "  -n, --name <name>        Project name (also accepted as positional arg)",
      "  -t, --type <type>        backend | fullstack-react | fullstack-vue",
      "  -u, --ui <kit>           tailwind | daisyui | shadcn (fullstack only)",
      "  -s, --service <db>       none | sqlite | postgres | mongo",
      "  -h, --help               Show this help",
      "",
      "Run with no flags for an interactive walkthrough.",
    ].join("\n"),
  );
}

function printNextSteps(result: RunInitResult): void {
  const { spec, path } = result;
  console.log(`\n✓ Created ${spec.name} at ${path}`);
  const bits = [`type: ${spec.appType}`];
  if (isFullstack(spec)) bits.push(`ui: ${spec.ui}`);
  bits.push(`service: ${spec.service}`);
  console.log(`  ${bits.join("  ·  ")}\n`);
  console.log("Next:");
  console.log(`  cd ${spec.name}`);
  console.log(`  deno task dev`);
  if (spec.service !== "none") console.log(`  open http://localhost:8000/studio`);
}

if (import.meta.main) await main();
