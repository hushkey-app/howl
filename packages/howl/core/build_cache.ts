import * as path from "@std/path";
import type { Command } from "./commands.ts";
import { fsItemsToCommands, type FsRouteFile } from "./fs_routes.ts";
import type { ServerIslandRegistry } from "./context.ts";
import type { AnyComponent, ComponentType } from "preact";
import { UniqueNamer } from "./utils.ts";
import { setBuildId } from "../utils/build-id.ts";

/**
 * Description of a single file emitted by the build pipeline. Used by the
 * static-file middleware to look up assets at request time.
 */
export interface FileSnapshot {
  /** Public URL pathname (relative to the build root). */
  name: string;
  /** Absolute or root-relative path on disk. */
  filePath: string;
  /** Content hash for cache busting; `null` for non-hashable files. */
  hash: string | null;
  /** Resolved MIME type. */
  contentType: string;
}

/**
 * The serialised output of a production build — written by HowlBuilder and
 * read back by {@linkcode ProdBuildCache} at runtime.
 */
export interface BuildSnapshot<State> {
  /** Build identifier; used as a cache-busting suffix. */
  version: string;
  /** URL of the client entrypoint chunk. */
  clientEntry: string;
  /** All file-system route files collected at build time. */
  fsRoutes: FsRouteFile<State>[];
  /** API definitions — stored for production route registration */
  apiRoutes?: unknown[];
  /** Map from public pathname to {@linkcode FileSnapshot}. */
  staticFiles: Map<string, FileSnapshot>;
  /** Compiled island registry. */
  islands: ServerIslandRegistry;
  /** JS/CSS asset URLs that ship with every page. */
  entryAssets: string[];
  /** Map of route pattern → AOT chunk URL for ahead-of-time-compiled pages. */
  aotRoutes?: Map<string, string>;
  /** Map of route pattern → prerendered HTML for SSG-flagged pages. */
  ssgPages?: Map<string, string>;
}

/**
 * A handle to a static file resolved by {@linkcode BuildCache.readFile} —
 * used by the static-file middleware to stream the response body.
 */
export interface StaticFile {
  /** Content hash, or `null` when not available. */
  hash: string | null;
  /** Size in bytes. */
  size: number;
  /** Resolved MIME type. */
  contentType: string;
  /** Streaming or buffered file contents. */
  readable: ReadableStream<Uint8Array> | Uint8Array;
  /** Releases any underlying file handle. */
  close(): void;
}

/**
 * Runtime view of build artefacts — implemented by both the production
 * snapshot reader and the dev-mode in-memory cache.
 */
// deno-lint-ignore no-explicit-any
export interface BuildCache<State = any> {
  /** Project root that file paths are resolved against. */
  root: string;
  /** Registry of islands compiled into the build. */
  islandRegistry: ServerIslandRegistry;
  /** Registry of API definitions keyed by path — used for client generation */
  apiRegistry: Map<string, unknown>;
  /** URL of the client runtime entry chunk. */
  clientEntry: string;
  /** Feature flags toggled by the build pipeline. */
  features: {
    /** Whether the dev error overlay is mounted. */
    errorOverlay: boolean;
  };
  /** Returns the file-system route commands collected at build time. */
  getFsRoutes(): Command<State>[];
  /** Returns the registered API route definitions. */
  getApiRoutes(): unknown[];
  /** Resolves a static file by URL pathname or returns `null` if missing. */
  readFile(pathname: string): Promise<StaticFile | null>;
  /** Returns the JS/CSS asset URLs that ship with every page. */
  getEntryAssets(): string[];
  /**
   * Map of route pattern → AOT chunk URL. Populated for pages opted into
   * client-side navigation via the `__page.tsx` filename prefix. Empty when
   * no AOT pages are registered.
   */
  aotRoutes: Map<string, string>;
  /**
   * Map of route pattern → prerendered HTML string. Populated at build time
   * for routes flagged with the `___page.tsx` SSG prefix. Looked up before
   * the dynamic renderer to short-circuit request handling.
   */
  ssgPages: Map<string, string>;
}

/**
 * {@linkcode BuildCache} implementation backed by a {@linkcode BuildSnapshot}
 * produced by `HowlBuilder.build()` and consumed in production.
 */
export class ProdBuildCache<State> implements BuildCache<State> {
  #snapshot: BuildSnapshot<State>;
  /** Registry of compiled islands. */
  islandRegistry: ServerIslandRegistry;
  /** URL of the client entrypoint chunk. */
  clientEntry: string;
  /** Map of `METHOD:path` to API definition. */
  apiRegistry: Map<string, unknown> = new Map();
  /** Disabled in production builds. */
  features: { errorOverlay: boolean } = { errorOverlay: false };
  /** Map of route pattern → AOT chunk URL, populated from the snapshot. */
  aotRoutes: Map<string, string>;
  /** Map of route pattern → prerendered HTML, populated from the snapshot. */
  ssgPages: Map<string, string>;

  /** Build a production cache from a serialised snapshot. */
  constructor(public root: string, snapshot: BuildSnapshot<State>) {
    setBuildId(snapshot.version);
    this.#snapshot = snapshot;
    this.islandRegistry = snapshot.islands;
    this.clientEntry = snapshot.clientEntry;
    this.aotRoutes = snapshot.aotRoutes ?? new Map();
    this.ssgPages = snapshot.ssgPages ?? new Map();

    // Populate apiRegistry from snapshot
    for (const api of snapshot.apiRoutes ?? []) {
      // deno-lint-ignore no-explicit-any
      const a = api as any;
      const paths = Array.isArray(a.path) ? a.path : [a.path];
      for (const p of paths) {
        this.apiRegistry.set(`${a.method}:${p}`, api);
      }
    }
  }

  /** Returns the JS/CSS asset URLs that ship with every page. */
  getEntryAssets(): string[] {
    return this.#snapshot.entryAssets;
  }

  /** Returns file-system route commands rebuilt from the snapshot. */
  getFsRoutes(): Command<State>[] {
    return fsItemsToCommands(this.#snapshot.fsRoutes);
  }

  /** Returns the API definitions captured at build time. */
  getApiRoutes(): unknown[] {
    return this.#snapshot.apiRoutes ?? [];
  }

  /** Open a static file by URL pathname for streaming, or return `null` if absent. */
  async readFile(pathname: string): Promise<StaticFile | null> {
    const { staticFiles } = this.#snapshot;

    const info = staticFiles.get(pathname);
    if (info === undefined) return null;

    const filePath = path.isAbsolute(info.filePath)
      ? info.filePath
      : path.join(this.root, info.filePath);

    const [stat, file] = await Promise.all([
      Deno.stat(filePath),
      Deno.open(filePath),
    ]);

    return {
      hash: info.hash,
      contentType: info.contentType,
      size: stat.size,
      readable: file.readable,
      close: () => file.close(),
    };
  }
}

/**
 * Walks an island module's exports and registers each component in the
 * {@linkcode ServerIslandRegistry} with a unique name.
 */
export class IslandPreparer {
  #namer = new UniqueNamer();

  /**
   * Register every function export in `mod` as an island component, attaching
   * the resolved chunk name and CSS dependencies.
   */
  prepare(
    registry: ServerIslandRegistry,
    mod: Record<string, unknown>,
    chunkName: string,
    modName: string,
    css: string[],
  ): void {
    const directive = mod["howl"] as
      | { ssr?: boolean; skeleton?: ComponentType }
      | undefined;
    const ssr = directive?.ssr !== false; // default true
    const skeleton = directive?.skeleton;

    for (const [name, value] of Object.entries(mod)) {
      if (typeof value !== "function") continue;

      const islandName = name === "default" ? modName : name;
      const uniqueName = this.#namer.getUniqueName(islandName);

      const fn = value as AnyComponent;
      registry.set(fn, {
        exportName: name,
        file: chunkName,
        fn,
        name: uniqueName,
        css,
        ssr,
        skeleton,
      });
    }
  }
}
