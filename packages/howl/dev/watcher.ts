import * as path from "@std/path";

/**
 * What a changed file means to the dev server.
 *
 * - `client` — a file the runtime cannot import (`.vue`, CSS, assets) inside the
 *   client tree: rebuild the browser bundle in place.
 * - `static` — a file under the static directory: drop its transformed copy.
 * - `api` — a file under `apis/`: re-import the route definitions.
 * - `restart` — a client-tree module the runtime imported itself (`.ts`/`.tsx`).
 *   Its old copy is pinned in the module cache, so server-rendered output would
 *   go stale behind a hot rebuild: the process has to come back.
 * - `ignored` — build output, dependencies, editor droppings, or server code
 *   outside the watched tree, which the runtime's own watcher already covers.
 */
export type DevChangeKind = "client" | "static" | "api" | "restart" | "ignored";

/** Directories {@linkcode classifyDevChange} matches a changed path against. */
export interface DevWatchDirs {
  /** Build output directory (`_howl` / `dist`) — never a source of changes. */
  outDir: string;
  /** Root of the client tree; falls back to the route directory. */
  clientDir: string;
  /** Static assets directory. */
  staticDir: string;
  /** `apis/` directory, when the app registered API routes. */
  apiDir: string | null;
}

/** Path segments that never carry app source. */
const IGNORED_SEGMENTS = new Set(["node_modules", ".git", ".deno", "_howl"]);

/** Editor droppings and atomic-save temporaries. */
const IGNORED_FILE_RE = /(^\.|~$|\.(?:sw[a-z]|tmp|temp|crswap)$)/i;

/**
 * Extensions the runtime imports itself. A hot rebuild can refresh the browser
 * bundle for these but not the copy the module cache is holding, so the two
 * would disagree — server-rendered markup one version behind the script that
 * hydrates it.
 */
const RUNTIME_MODULE_RE = /\.(?:[cm]?[jt]sx?)$/i;

/** Whether `child` is `parent` or sits inside it. */
function isInside(child: string, parent: string): boolean {
  if (parent === "") return false;
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Decide what a changed file means to the dev server.
 *
 * Order matters: build output is rejected first (the bundler writes its page
 * wrappers there, so treating it as a source change would rebuild forever),
 * then dependencies and editor temporaries, then the source directories from
 * most to least specific.
 */
export function classifyDevChange(filePath: string, dirs: DevWatchDirs): DevChangeKind {
  const normalized = path.resolve(filePath);

  if (isInside(normalized, dirs.outDir)) return "ignored";

  for (const segment of normalized.split(path.SEPARATOR)) {
    if (IGNORED_SEGMENTS.has(segment)) return "ignored";
  }
  if (IGNORED_FILE_RE.test(path.basename(normalized))) return "ignored";

  if (dirs.apiDir !== null && isInside(normalized, dirs.apiDir)) return "api";
  if (isInside(normalized, dirs.staticDir)) return "static";
  if (isInside(normalized, dirs.clientDir)) {
    return RUNTIME_MODULE_RE.test(normalized) ? "restart" : "client";
  }

  return "ignored";
}

/**
 * Debounced filesystem watcher over a set of directories.
 *
 * Batches events inside a short window so one editor save — which fans out into
 * several `modify`/`create` events — drives a single rebuild, and never runs two
 * batches concurrently: changes arriving mid-rebuild queue up for the next one.
 */
export class DevWatcher {
  #watcher: Deno.FsWatcher | null = null;
  #pending = new Set<string>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;
  #closed = false;
  #loop: Promise<void> | null = null;
  #dirs: string[];
  #debounceMs: number;
  #onBatch: (paths: string[]) => Promise<void>;

  /**
   * Build a watcher over `dirs`. Nothing is watched until {@linkcode start}.
   *
   * @param dirs Directories to watch; missing ones are skipped.
   * @param onBatch Invoked with the coalesced absolute paths of a batch.
   * @param debounceMs Coalescing window in milliseconds.
   */
  constructor(
    dirs: string[],
    onBatch: (paths: string[]) => Promise<void>,
    debounceMs = 30,
  ) {
    this.#dirs = dirs;
    this.#onBatch = onBatch;
    this.#debounceMs = debounceMs;
  }

  /**
   * Begin watching. Returns `false` when none of the directories exist, so the
   * caller can fall back to whatever the runtime's own watcher provides.
   */
  start(): boolean {
    const existing = this.#dirs.filter((dir) => {
      try {
        return Deno.statSync(dir).isDirectory;
      } catch {
        return false;
      }
    });
    if (existing.length === 0) return false;

    this.#watcher = Deno.watchFs(existing, { recursive: true });
    this.#loop = this.#consume();
    return true;
  }

  async #consume(): Promise<void> {
    if (this.#watcher === null) return;
    try {
      for await (const event of this.#watcher) {
        if (event.kind === "access") continue;
        for (const p of event.paths) this.#pending.add(p);
        this.#schedule();
      }
    } catch {
      // The watcher throws BadResource when closed mid-iteration — that is the
      // shutdown path, not a failure.
    }
  }

  #schedule(): void {
    if (this.#closed) return;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#drain();
    }, this.#debounceMs);
  }

  async #drain(): Promise<void> {
    if (this.#running || this.#closed) return;
    if (this.#pending.size === 0) return;
    this.#running = true;
    const batch = [...this.#pending];
    this.#pending.clear();
    try {
      await this.#onBatch(batch);
    } finally {
      this.#running = false;
      // Anything that landed while the batch ran gets its own pass.
      if (this.#pending.size > 0) this.#schedule();
    }
  }

  /** Stop watching and wait for the event loop to unwind. */
  async close(): Promise<void> {
    this.#closed = true;
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    try {
      this.#watcher?.close();
    } catch {
      // Already closed.
    }
    this.#watcher = null;
    await this.#loop;
    this.#loop = null;
  }
}
