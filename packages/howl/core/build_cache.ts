import * as path from "@std/path";
import type { Command } from "./commands.ts";
import type { EngineRouteInfo } from "./engine.ts";
import { fsItemsToCommands, type FsRouteFile } from "./fs_routes.ts";
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
  /** Size in bytes, captured at build time (absent in pre-size snapshots). */
  size?: number;
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
  /** JS/CSS asset URLs that ship with every page. */
  entryAssets: string[];
  /** Map of route pattern → prerendered HTML for SSG-flagged pages. */
  ssgPages?: Map<string, string>;
  /** Map of AOT `.vue` route pattern → client chunk URL (client-rendered on nav). */
  engineAot?: Map<string, string>;
  /** Map of `.vue` page file path → client hydration chunk URL. */
  enginePages?: Map<string, string>;
  /** Map of `.vue` page file path → precompiled SSR module namespace (prod). */
  engineSsrModules?: Map<string, unknown>;
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
  /**
   * Returns the engine route map (pattern + `ssr`/`aot`/`ssg` mode) for an
   * engine's dev DevTools integration. Optional — implemented by the dev build
   * caches only; absent in production, where the DevTools panel is inactive.
   */
  getEngineRoutes?(): EngineRouteInfo[];
  /** Returns the registered API route definitions. */
  getApiRoutes(): unknown[];
  /** Resolves a static file by URL pathname or returns `null` if missing. */
  readFile(pathname: string): Promise<StaticFile | null>;
  /** Returns the JS/CSS asset URLs that ship with every page. */
  getEntryAssets(): string[];
  /**
   * Map of route pattern → prerendered HTML string. Populated at build time
   * for routes flagged with the `___page.tsx` SSG prefix. Looked up before
   * the dynamic renderer to short-circuit request handling.
   */
  ssgPages: Map<string, string>;
  /**
   * Map of AOT `.vue` route pattern (`/about/:id`) → client chunk URL. Populated
   * for `__`-prefixed `.vue` routes; emitted as `window.__HOWL_VUE_AOT__` so the
   * client renders these routes on navigation without a server round-trip.
   */
  engineAot: Map<string, string>;
  /**
   * Map of `.vue` page source-file path → client hydration chunk URL. Looked up
   * by the Vue render engine to inject the right hydration script. Empty unless
   * the project contains `.vue` page routes.
   */
  enginePages: Map<string, string>;
  /**
   * Map of `.vue` page file path → its precompiled SSR module (export shape
   * `{ app, layouts, page, styles, pinia }`). Statically imported by the
   * production snapshot so a `deno compile` binary needs no `.vue` source on
   * disk. Empty in dev, where the Vue engine compiles each page per request.
   */
  engineSsrModules: Map<string, unknown>;
}

/**
 * {@linkcode BuildCache} implementation backed by a {@linkcode BuildSnapshot}
 * produced by `HowlBuilder.build()` and consumed in production.
 */
export class ProdBuildCache<State> implements BuildCache<State> {
  #snapshot: BuildSnapshot<State>;
  /** URL of the client entrypoint chunk. */
  clientEntry: string;
  /** Map of `METHOD:path` to API definition. */
  apiRegistry: Map<string, unknown> = new Map();
  /** Disabled in production builds. */
  features: { errorOverlay: boolean } = { errorOverlay: false };
  /** Map of route pattern → prerendered HTML, populated from the snapshot. */
  ssgPages: Map<string, string>;
  /** Map of AOT `.vue` route pattern → client chunk URL, from the snapshot. */
  engineAot: Map<string, string>;
  /** Map of `.vue` page file path → hydration chunk URL, from the snapshot. */
  enginePages: Map<string, string>;
  /** Map of `.vue` page file path → precompiled SSR module, from the snapshot. */
  engineSsrModules: Map<string, unknown>;

  /** Build a production cache from a serialised snapshot. */
  constructor(public root: string, snapshot: BuildSnapshot<State>) {
    setBuildId(snapshot.version);
    this.#snapshot = snapshot;
    this.clientEntry = snapshot.clientEntry;
    this.ssgPages = snapshot.ssgPages ?? new Map();
    this.engineAot = snapshot.engineAot ?? new Map();
    this.enginePages = snapshot.enginePages ?? new Map();
    this.engineSsrModules = snapshot.engineSsrModules ?? new Map();

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

    // Size comes from the snapshot (captured at build time); the stat fallback
    // only runs for snapshots produced before the field existed.
    const file = await Deno.open(filePath);
    const size = info.size ?? (await file.stat()).size;

    return {
      hash: info.hash,
      contentType: info.contentType,
      size,
      readable: file.readable,
      close: () => file.close(),
    };
  }
}
