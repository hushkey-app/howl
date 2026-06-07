#!/usr/bin/env -S deno run -A
/**
 * version — unify and bump the version of every package under `packages/`.
 *
 * All `@hushkey/*` packages share a single version. This CLI reads each
 * workspace member's deno.json, sets every package to one version, and rewrites
 * the cross-package `jsr:@hushkey/...@^x.y.z` references everywhere they appear
 * (packages and examples) so nothing is left pointing at a stale range.
 *
 * Usage:
 *   deno task version status                  # show current versions
 *   deno task version upgrade patch           # 0.10.0 -> 0.10.1 (all packages)
 *   deno task version upgrade minor           # 0.10.0 -> 0.11.0 (all packages)
 *   deno task version set 0.12.0              # set an explicit version
 *   deno task version upgrade patch --dry-run # preview only, write nothing
 *
 * `major` bumps are intentionally refused for now.
 */
import { parseArgs } from "jsr:@std/cli@^1.0.0/parse-args";
import { fromFileUrl } from "jsr:@std/path@^1.0.0";

const ROOT_URL = new URL("../", import.meta.url);
const ROOT_DENO_JSON = new URL("deno.json", ROOT_URL);

interface DenoJson {
  name?: string;
  version?: string;
  workspace?: string[];
  imports?: Record<string, string>;
  [key: string]: unknown;
}

interface Member {
  /** Workspace-relative dir, e.g. "./packages/howl". */
  dir: string;
  /** Absolute path to the member's deno.json. */
  path: string;
  /** Raw file contents (formatting preserved on write). */
  raw: string;
  /** Parsed config (read-only view). */
  config: DenoJson;
  /** True for members under `./packages/` that carry a name + version. */
  isPackage: boolean;
}

const flags = parseArgs(Deno.args, {
  boolean: ["dry-run", "help"],
  alias: { h: "help" },
});

if (flags.help) {
  printHelp();
  Deno.exit(0);
}

const [command, argument] = flags._.map(String);

const members = await loadMembers();
const packages = members.filter((m) => m.isPackage);
if (packages.length === 0) {
  console.error("✗ No versioned packages found under ./packages/");
  Deno.exit(1);
}
const packageNames = new Set(packages.map((m) => m.config.name!));

switch (command) {
  case undefined:
  case "status":
    printStatus(packages);
    break;
  case "upgrade":
    await applyVersion(bumpFrom(currentBaseline(packages), assertBump(argument)));
    break;
  case "set":
    await applyVersion(assertSemver(argument));
    break;
  default:
    console.error(`✗ Unknown command "${command}"\n`);
    printHelp();
    Deno.exit(1);
}

/** Reads every workspace member's deno.json. */
async function loadMembers(): Promise<Member[]> {
  const rootRaw = await Deno.readTextFile(fromFileUrl(ROOT_DENO_JSON));
  const root = JSON.parse(rootRaw) as DenoJson;
  const dirs = root.workspace ?? [];
  const result: Member[] = [];
  for (const dir of dirs) {
    const path = fromFileUrl(new URL(`${dir}/deno.json`, ROOT_URL));
    let raw: string;
    try {
      raw = await Deno.readTextFile(path);
    } catch {
      continue;
    }
    const config = JSON.parse(raw) as DenoJson;
    const isPackage = dir.startsWith("./packages/") &&
      typeof config.name === "string" &&
      typeof config.version === "string";
    result.push({ dir, path, raw, config, isPackage });
  }
  return result;
}

/** Highest version among packages — the unified baseline to bump from. */
function currentBaseline(pkgs: Member[]): string {
  return pkgs
    .map((m) => m.config.version!)
    .sort(compareSemver)
    .at(-1)!;
}

/** Writes the new version to every package and rewrites all cross-refs. */
async function applyVersion(next: string): Promise<void> {
  const baseline = currentBaseline(packages);
  console.log(`📦 Unifying ${packageNames.size} packages → ${next}`);
  if (baseline !== next) console.log(`   baseline ${baseline} → ${next}`);
  if (flags["dry-run"]) console.log("   (dry run — nothing written)");
  console.log("");

  for (const member of members) {
    let updated = member.raw;
    const changes: string[] = [];

    if (member.isPackage && member.config.version !== next) {
      updated = setVersionField(updated, next);
      changes.push(`version ${member.config.version} → ${next}`);
    }

    const refResult = setCrossRefs(updated, packageNames, next);
    updated = refResult.text;
    changes.push(...refResult.changes);

    if (changes.length === 0) continue;

    const label = member.config.name ?? member.dir;
    console.log(`  ${label}`);
    for (const change of changes) console.log(`    • ${change}`);

    if (!flags["dry-run"]) await Deno.writeTextFile(member.path, updated);
  }

  console.log(flags["dry-run"] ? "\n✓ Dry run complete" : "\n✓ Versions unified");
}

/** Replaces the top-level `"version"` field, preserving formatting. */
function setVersionField(raw: string, next: string): string {
  const updated = raw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${next}$2`);
  if (updated === raw) throw new Error("Could not find version field in deno.json");
  return updated;
}

/**
 * Rewrites `jsr:@hushkey/<pkg>@^x.y.z` ranges (and any `/subpath` suffix) for
 * each of our package names to `^next`.
 */
function setCrossRefs(
  raw: string,
  names: Set<string>,
  next: string,
): { text: string; changes: string[] } {
  const changes: string[] = [];
  let text = raw;
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const pattern = new RegExp(
      `(jsr:${escaped}@\\^)(\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?)`,
      "g",
    );
    text = text.replace(pattern, (_match, prefix: string, prev: string) => {
      if (prev !== next) changes.push(`${name}@^${prev} → ^${next}`);
      return `${prefix}${next}`;
    });
  }
  // Collapse duplicate change lines (same dep referenced via subpaths).
  return { text, changes: [...new Set(changes)] };
}

/** Prints the current version of every package. */
function printStatus(pkgs: Member[]): void {
  const baseline = currentBaseline(pkgs);
  const unified = pkgs.every((m) => m.config.version === baseline);
  console.log(`📦 Packages (baseline ${baseline}${unified ? ", unified" : ""}):\n`);
  const width = Math.max(...pkgs.map((m) => m.config.name!.length));
  for (const m of pkgs) {
    const mark = m.config.version === baseline ? "✓" : "✗";
    console.log(`  ${mark} ${m.config.name!.padEnd(width)}  ${m.config.version}`);
  }
  if (!unified) console.log(`\n  Run "deno task version set ${baseline}" to unify.`);
}

type Bump = "minor" | "patch";

function assertBump(value: string | undefined): Bump {
  if (value === "minor" || value === "patch") return value;
  if (value === "major") {
    throw new Error("major bumps are not supported yet");
  }
  throw new Error(`expected "minor" or "patch", got "${value ?? ""}"`);
}

function assertSemver(value: string | undefined): string {
  if (value && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value)) return value;
  throw new Error(`expected a semver like 1.2.3, got "${value ?? ""}"`);
}

function bumpFrom(version: string, kind: Bump): string {
  const [major, minor, patch] = parseSemver(version);
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function parseSemver(version: string): [number, number, number] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot parse version "${version}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function printHelp(): void {
  console.log(
    [
      "version — unify and bump the version of every package under packages/",
      "",
      "Usage:",
      "  deno task version status            Show every package's version",
      "  deno task version upgrade patch     Bump all: 0.10.0 → 0.10.1",
      "  deno task version upgrade minor     Bump all: 0.10.0 → 0.11.0",
      "  deno task version set 0.12.0        Set an explicit version on all",
      "",
      "Flags:",
      "  --dry-run    Preview changes without writing any files",
      "  -h, --help   Show this help",
      "",
      "Notes:",
      "  • All packages are kept on one shared version (baseline = highest).",
      "  • Cross-package jsr:@hushkey/...@^x refs are rewritten everywhere,",
      "    including examples/, so nothing points at a stale range.",
      "  • major bumps are intentionally refused.",
    ].join("\n"),
  );
}
