import { parseArgs } from "@std/cli/parse-args";
import { fromFileUrl } from "@std/path";

const denoJsonUrl = new URL("../deno.json", import.meta.url);
const denoJsonPath = fromFileUrl(denoJsonUrl);

interface DenoJson {
  name: string;
  version: string;
  [key: string]: unknown;
}

const flags = parseArgs(Deno.args, {
  string: ["bump", "version"],
  boolean: ["dry-run", "skip-publish", "help"],
  alias: { h: "help", b: "bump", v: "version" },
  default: { bump: "patch" },
});

if (flags.help) {
  printHelp();
  Deno.exit(0);
}

const raw = await Deno.readTextFile(denoJsonPath);
const config = JSON.parse(raw) as DenoJson;
const currentVersion = config.version;
const nextVersion = flags.version
  ? assertSemver(flags.version)
  : bumpSemver(currentVersion, assertBump(flags.bump));

console.log(`📦 ${config.name}`);
console.log(`   ${currentVersion} → ${nextVersion}`);
if (flags["dry-run"]) console.log("   (dry run — no files written, no publish)\n");
else console.log("");

if (!flags["dry-run"]) {
  await writeVersion(raw, nextVersion);
  console.log(`✓ Updated deno.json`);
}

console.log("→ Generating manifest");
await runOrExit(["deno", "task", "manifest"]);

console.log("→ Running tests");
await runOrExit(["deno", "task", "test"]);

if (flags["skip-publish"]) {
  console.log("\n✓ Skipped publish (--skip-publish)");
  Deno.exit(0);
}

if (flags["dry-run"]) {
  console.log("\n→ Publish (dry run)");
  await runOrExit(["deno", "publish", "--dry-run", "--allow-dirty"]);
  console.log("\n✓ Dry run complete — nothing was published");
} else {
  console.log("\n→ Publishing to JSR");
  await runOrExit(["deno", "publish"]);
  console.log(`\n✓ Published ${config.name}@${nextVersion}`);
}

async function runOrExit(cmd: string[]): Promise<void> {
  const proc = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "inherit",
    stderr: "inherit",
    cwd: fromFileUrl(new URL("..", import.meta.url)),
  });
  const { code } = await proc.output();
  if (code !== 0) {
    console.error(`✗ Command failed: ${cmd.join(" ")}`);
    Deno.exit(code);
  }
}

async function writeVersion(raw: string, next: string): Promise<void> {
  const updated = raw.replace(
    /("version"\s*:\s*")[^"]+(")/,
    `$1${next}$2`,
  );
  if (updated === raw) {
    throw new Error("Could not find version field in deno.json");
  }
  await Deno.writeTextFile(denoJsonPath, updated);
}

type Bump = "major" | "minor" | "patch";

function assertBump(value: string): Bump {
  if (value === "major" || value === "minor" || value === "patch") return value;
  throw new Error(`Invalid --bump "${value}" — expected major, minor, or patch`);
}

function assertSemver(value: string): string {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value)) {
    throw new Error(`Invalid --version "${value}" — expected semver like 1.2.3`);
  }
  return value;
}

function bumpSemver(version: string, kind: Bump): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot parse current version "${version}"`);
  const [_, major, minor, patch] = match.map(Number) as unknown as [
    unknown,
    number,
    number,
    number,
  ];
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function printHelp(): void {
  console.log(
    [
      "release — bump version, regenerate manifest, run tests, publish to JSR",
      "",
      "Usage:",
      "  deno task release                    # patch bump + publish",
      "  deno task release --bump minor       # minor bump + publish",
      "  deno task release --version 1.2.3    # set explicit version + publish",
      "  deno task release --dry-run          # preview only, no writes, dry-run publish",
      "  deno task release --skip-publish     # bump + manifest + tests, no publish",
      "",
      "Flags:",
      "  -b, --bump <major|minor|patch>   Default: patch",
      "  -v, --version <semver>           Set exact version (overrides --bump)",
      "      --dry-run                    Don't write files; run `deno publish --dry-run`",
      "      --skip-publish               Stop after tests; don't publish",
      "  -h, --help                       Show this help",
    ].join("\n"),
  );
}
