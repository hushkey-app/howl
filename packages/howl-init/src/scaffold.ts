import { dirname, join } from "@std/path";
import { ensureDir } from "@std/fs";
import type { ProjectSpec } from "./spec.ts";
import { buildProjectFiles } from "./blueprint/mod.ts";

/** Progress callback invoked after each file is written. */
export interface ScaffoldProgress {
  /** Index of the file just written, starting at 1. */
  current: number;
  /** Total number of files to write. */
  total: number;
  /** Project-relative path of the file just written. */
  file: string;
}

/** Inputs to {@link scaffold}. */
export interface ScaffoldOptions {
  /** Resolved project description (name, app type, UI kit, service layer). */
  spec: ProjectSpec;
  /** Absolute path of the new project directory. Created if missing; must be empty if it exists. */
  targetDir: string;
  /** Optional progress callback, fired once per file as it is written. */
  onProgress?: (progress: ScaffoldProgress) => void;
}

/**
 * Generate a project from its {@link ProjectSpec} and write it to `targetDir`.
 *
 * The file set is composed in-memory by {@link buildProjectFiles} — there is no
 * template folder or manifest to fetch. The target directory must be empty (or
 * not exist).
 */
export async function scaffold(opts: ScaffoldOptions): Promise<void> {
  await assertEmptyTarget(opts.targetDir);
  await ensureDir(opts.targetDir);

  const files = [...buildProjectFiles(opts.spec)];
  for (let i = 0; i < files.length; i++) {
    const [rel, content] = files[i];
    const destPath = join(opts.targetDir, rel);
    await ensureDir(dirname(destPath));
    await Deno.writeTextFile(destPath, content);
    opts.onProgress?.({ current: i + 1, total: files.length, file: rel });
  }
}

async function assertEmptyTarget(targetDir: string): Promise<void> {
  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const e of Deno.readDir(targetDir)) entries.push(e);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return;
    throw err;
  }
  if (entries.length > 0) {
    throw new Error(
      `Target directory is not empty: ${targetDir} (${entries.length} existing entries)`,
    );
  }
}
