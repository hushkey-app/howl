import { type BuildCache, IslandPreparer, type StaticFile } from "../core/build_cache.ts";
import * as path from "@std/path";
import { encodeHex } from "@std/encoding/hex";
import { fsAdapter } from "../core/fs.ts";
import type { FileTransformer } from "./file_transformer.ts";
import { assertInDir, pathToSpec } from "../core/utils.ts";
import type { ResolvedBuildConfig } from "./builder.ts";
import { fsItemsToCommands, type FsRouteFile } from "../core/fs_routes.ts";
import type { Command } from "../core/commands.ts";
import type { ServerIslandRegistry } from "../core/context.ts";
import { contentType as getStdContentType } from "@std/media-types/content-type";

export interface MemoryFile {
  hash: string | null;
  contentType: string;
  content: Uint8Array;
}

export interface IslandModChunk {
  name: string;
  server: string;
  browser: string | null;
  css: string[];
}

export type FsRouteFileNoMod<State> = Omit<FsRouteFile<State>, "mod"> & {
  lazy: boolean;
  /**
   * Marks the route as ahead-of-time (AOT) compiled. AOT routes are also
   * emitted as standalone client chunks so subsequent in-app navigation can
   * load them without round-tripping the server. The first request to an AOT
   * route still SSRs the shell.
   */
  aot?: boolean;
  /**
   * Marks the route for static site generation (SSG). The handler runs once
   * at build time and the resulting HTML is cached; subsequent requests skip
   * the renderer entirely. SSG implies {@linkcode aot} — the matching client
   * chunk still ships so navigation between flagged pages stays seamless.
   */
  ssg?: boolean;
};

export interface FsRoute<State> {
  id: string;
  dir: string;
  files: FsRouteFileNoMod<State>[];
}

/** Tracks an API module discovered during build so it can be imported in the production snapshot. */
export interface ApiEntry {
  /** Absolute path to the .api.ts file */
  filePath: string;
  /** Non-null when the API module has no explicit `path` — holds the fs-inferred route */
  overridePath: string | null;
}

export interface DevBuildCache<State> extends BuildCache<State> {
  islandModNameToChunk: Map<string, IslandModChunk>;
  /** Registry of API definitions keyed by METHOD:path */
  apiRegistry: Map<string, unknown>;
  getApiRoutes(): unknown[];
  setApiRoutes(apis: unknown[]): void;
  setApiEntries(entries: ApiEntry[]): void;
  addUnprocessedFile(pathname: string, dir: string): void;
  addProcessedFile(
    pathname: string,
    content: Uint8Array,
    hash: string | null,
  ): Promise<void>;
  flush(): Promise<void>;
  prepare(): Promise<void>;
}

export class MemoryBuildCache<State> implements DevBuildCache<State> {
  #processedFiles = new Map<string, MemoryFile>();
  #unprocessedFiles = new Map<string, string>();
  #inFlight = new Map<string, Promise<StaticFile | null>>();
  #config: ResolvedBuildConfig;
  #transformer: FileTransformer;
  #apis: unknown[] = [];
  islandModNameToChunk = new Map<string, IslandModChunk>();
  apiRegistry: Map<string, unknown> = new Map();
  #fsRoutes: FsRoute<State>;
  #commands: Command<State>[] = [];
  root: string;
  islandRegistry: ServerIslandRegistry = new Map();
  clientEntry: string;
  features = { errorOverlay: false };
  aotRoutes: Map<string, string> = new Map();
  ssgPages: Map<string, string> = new Map();

  constructor(
    config: ResolvedBuildConfig,
    fsRoutes: FsRoute<State>,
    transformer: FileTransformer,
  ) {
    if (config.mode === "development") {
      this.features.errorOverlay = true;
    }

    this.#config = config;
    this.#fsRoutes = fsRoutes;
    this.#transformer = transformer;
    this.root = config.root;
    this.clientEntry = getClientEntry(config.buildId);
  }

  getEntryAssets(): string[] {
    return [];
  }

  getFsRoutes(): Command<State>[] {
    return this.#commands;
  }

  getApiRoutes(): unknown[] {
    return this.#apis;
  }

  setApiRoutes(apis: unknown[]): void {
    this.#apis = apis;
    // Populate registry keyed by METHOD:path
    for (const api of apis) {
      // deno-lint-ignore no-explicit-any
      const a = api as any;
      const paths = Array.isArray(a.path) ? a.path : [a.path];
      for (const p of paths) {
        this.apiRegistry.set(`${a.method}:${p}`, api);
      }
    }
  }

  setApiEntries(_entries: ApiEntry[]): void {
    // No-op in dev mode — APIs are registered directly via apiHandler
  }

  async readFile(pathname: string): Promise<StaticFile | null> {
    const processed = this.#processedFiles.get(pathname);
    if (processed !== undefined) {
      return {
        hash: processed.hash,
        readable: processed.content,
        size: processed.content.byteLength,
        contentType: processed.contentType,
        close: () => {},
      };
    }

    const unprocessed = this.#unprocessedFiles.get(pathname);
    if (unprocessed !== undefined) {
      try {
        const [stat, file] = await Promise.all([
          Deno.stat(unprocessed),
          Deno.open(unprocessed, { read: true }),
        ]);
        return {
          hash: null,
          size: stat.size,
          readable: file.readable,
          contentType: getContentType(unprocessed),
          close: () => file.close(),
        };
      } catch {
        return null;
      }
    }

    // Deduplicate concurrent requests for the same pathname
    const inflight = this.#inFlight.get(pathname);
    if (inflight !== undefined) return inflight;

    const promise = this.#processPathname(pathname);
    this.#inFlight.set(pathname, promise);
    try {
      return await promise;
    } finally {
      this.#inFlight.delete(pathname);
    }
  }

  async #processPathname(pathname: string): Promise<StaticFile | null> {
    let entry = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    entry = path.join(this.#config.staticDir, entry);
    const relative = path.relative(this.#config.staticDir, entry);
    if (relative.startsWith("..")) {
      throw new Error(
        `Processed file resolved outside of static dir ${entry}`,
      );
    }

    const transformed = await this.#transformer.process(
      entry,
      "development",
      this.#config.target,
    );

    if (transformed !== null) {
      for (let i = 0; i < transformed.length; i++) {
        const file = transformed[i];
        const rel = path.relative(this.#config.staticDir, file.path);
        if (rel.startsWith("..")) {
          throw new Error(
            `Processed file resolved outside of static dir ${file.path}`,
          );
        }
        const filePpathname = new URL(rel, "http://localhost").pathname;
        await this.addProcessedFile(filePpathname, file.content, null);
      }
      if (this.#processedFiles.has(pathname)) {
        return this.readFile(pathname);
      }
    } else {
      try {
        const filePath = path.join(this.#config.staticDir, pathname);
        const rel = path.relative(this.#config.staticDir, filePath);
        if (!rel.startsWith("..") && (await Deno.stat(filePath)).isFile) {
          const filePpathname = new URL(rel, "http://localhost").pathname;
          this.addUnprocessedFile(filePpathname, this.#config.staticDir);
          return this.readFile(pathname);
        }
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
          throw err;
        }
      }
    }

    return null;
  }

  addUnprocessedFile(pathname: string, dir: string): void {
    this.#unprocessedFiles.set(
      pathname,
      path.join(dir, pathname),
    );
  }

  // deno-lint-ignore require-await
  async addProcessedFile(
    pathname: string,
    content: Uint8Array,
    hash: string | null,
  ): Promise<void> {
    this.#processedFiles.set(pathname, {
      content,
      hash,
      contentType: getContentType(pathname),
    });
  }

  async flush(): Promise<void> {
    const preparer = new IslandPreparer();

    await Promise.all(
      Array.from(this.islandModNameToChunk.entries()).map(
        async ([name, chunk]) => {
          const fileUrl = maybeToFileUrl(chunk.server);
          const mod = await import(fileUrl);

          if (chunk.browser === null) {
            throw new Error(`Unexpected missing browser chunk`);
          }

          preparer.prepare(this.islandRegistry, mod, chunk.browser, name, []);
        },
      ),
    );
  }

  async prepare(): Promise<void> {
    const files = await Promise.all(this.#fsRoutes.files.map(async (file) => {
      const fileUrl = maybeToFileUrl(file.filePath);
      return {
        ...file,
        mod: file.lazy ? () => import(fileUrl) : await import(fileUrl),
      };
    }));
    this.#commands = fsItemsToCommands(files);
  }
}

export class DiskBuildCache<State> implements DevBuildCache<State> {
  #processedFiles = new Map<string, string | null>();
  #unprocessedFiles = new Map<string, string>();
  #transformer: FileTransformer;
  #config: ResolvedBuildConfig;
  #apis: unknown[] = [];
  #apiEntries: ApiEntry[] = [];
  islandModNameToChunk = new Map<string, IslandModChunk>();
  apiRegistry: Map<string, unknown> = new Map();
  #fsRoutes: FsRoute<State>;
  root: string;
  islandRegistry: ServerIslandRegistry = new Map();
  clientEntry: string = "";
  features = { errorOverlay: false };
  aotRoutes: Map<string, string> = new Map();
  ssgPages: Map<string, string> = new Map();
  #commands: Command<State>[] = [];

  constructor(
    config: ResolvedBuildConfig,
    fsRoutes: FsRoute<State>,
    transformer: FileTransformer,
  ) {
    if (config.mode === "development") {
      this.features.errorOverlay = true;
    }
    this.#fsRoutes = fsRoutes;
    this.#transformer = transformer;
    this.#config = config;
    this.root = config.root;
    this.clientEntry = getClientEntry(config.buildId);
  }

  getEntryAssets(): string[] {
    return [];
  }

  getFsRoutes(): Command<State>[] {
    return this.#commands;
  }

  getApiRoutes(): unknown[] {
    return this.#apis;
  }

  setApiRoutes(apis: unknown[]): void {
    this.#apis = apis;
    for (const api of apis) {
      // deno-lint-ignore no-explicit-any
      const a = api as any;
      const paths = Array.isArray(a.path) ? a.path : [a.path];
      for (const p of paths) {
        this.apiRegistry.set(`${a.method}:${p}`, api);
      }
    }
  }

  setApiEntries(entries: ApiEntry[]): void {
    this.#apiEntries = entries;
  }

  addUnprocessedFile(pathname: string, dir: string): void {
    this.#unprocessedFiles.set(
      pathname.replaceAll("\\", "/"),
      path.join(dir, pathname),
    );
  }

  async addProcessedFile(
    pathname: string,
    content: Uint8Array,
    hash: string | null,
  ) {
    this.#processedFiles.set(pathname, hash);

    const outDir = pathname === "/metafile.json"
      ? this.#config.outDir
      : path.join(this.#config.outDir, "static");
    const filePath = path.join(outDir, pathname);
    assertInDir(filePath, outDir);

    await fsAdapter.mkdirp(path.dirname(filePath));
    await Deno.writeFile(filePath, content);
  }

  async readFile(pathname: string): Promise<StaticFile | null> {
    // Used during the SSG prerender pass — the build cache is otherwise
    // write-only during production builds, but the prerender invokes the
    // app's handler which may run staticFiles() middleware and ask for
    // assets that have already been written to disk.
    const processed = this.#processedFiles.has(pathname);
    const unprocessed = this.#unprocessedFiles.get(pathname);
    let filePath: string | null = null;
    if (processed) {
      filePath = path.join(this.#config.outDir, "static", pathname);
    } else if (unprocessed !== undefined) {
      filePath = unprocessed;
    }
    if (filePath === null) return null;
    try {
      const [stat, file] = await Promise.all([
        Deno.stat(filePath),
        Deno.open(filePath, { read: true }),
      ]);
      return {
        hash: this.#processedFiles.get(pathname) ?? null,
        size: stat.size,
        readable: file.readable,
        contentType: getContentType(filePath),
        close: () => file.close(),
      };
    } catch {
      return null;
    }
  }

  async prepare(): Promise<void> {
    // Load route modules so `getFsRoutes()` can return real commands. This
    // is what enables the SSG prerender pass to dispatch through the app
    // handler during the build itself.
    const files = await Promise.all(this.#fsRoutes.files.map(async (file) => {
      const fileUrl = maybeToFileUrl(file.filePath);
      return {
        ...file,
        mod: file.lazy ? () => import(fileUrl) : await import(fileUrl),
      };
    }));
    this.#commands = fsItemsToCommands(files);
  }

  async flush(): Promise<void> {
    const { staticDir, outDir, target, root } = this.#config;

    if (await fsAdapter.isDirectory(staticDir)) {
      const entries = fsAdapter.walk(staticDir, {
        includeDirs: false,
        includeFiles: true,
        followSymlinks: false,
        skip: [/\/\.(?!well-known)[^/]+(\/|$)/],
      });

      for await (const entry of entries) {
        if (!path.relative(outDir, entry.path).startsWith("..")) {
          continue;
        }

        const result = await this.#transformer.process(
          entry.path,
          "production",
          target,
        );

        if (result !== null) {
          for (let i = 0; i < result.length; i++) {
            const file = result[i];
            assertInDir(file.path, staticDir);
            const pathname = `/${path.relative(staticDir, file.path)}`;
            await this.addProcessedFile(pathname, file.content, null);
          }
        } else {
          const relative = path.relative(staticDir, entry.path);
          const pathname = `/${relative}`;
          this.addUnprocessedFile(pathname, staticDir);
        }
      }
    }

    const staticFiles: PendingStaticFile[] = [];
    for (const [name, filePath] of this.#unprocessedFiles.entries()) {
      staticFiles.push({ filePath, pathname: name, hash: null });
    }

    for (const [name, maybeHash] of this.#processedFiles.entries()) {
      if (name === "/metafile.json") continue;
      const filePath = path.join(outDir, "static", name);
      staticFiles.push({ filePath, pathname: name, hash: maybeHash });
    }

    const islands = Array.from(this.islandModNameToChunk.values());

    await Deno.writeTextFile(
      path.join(outDir, "snapshot.js"),
      await generateSnapshotServer({
        buildId: this.#config.buildId,
        clientEntry: getClientEntry(this.#config.buildId),
        staticFiles,
        islands,
        writeSpecifier: (filePath) => pathToSpec(outDir, filePath),
        fsRoutesFiles: this.#fsRoutes.files,
        apiRoutes: this.#apis,
        apiEntries: this.#apiEntries,
        aotRoutes: this.aotRoutes,
        ssgPages: this.ssgPages,
        outDir: root,
        entryAssets: [],
      }),
    );

    const appPath = path.relative(outDir, root);
    await Deno.writeTextFile(
      path.join(outDir, "server.js"),
      generateServerEntry({
        root: appPath,
        serverEntry: pathToSpec(outDir, this.#config.serverEntry),
        snapshotSpecifier: "./snapshot.js",
        hasApiRoutes: this.#apiEntries.length > 0,
      }),
    );

    await writeCompiledEntry(outDir);
  }
}

const EDIT_WARNING = `// WARNING: DO NOT EDIT THIS FILE. It is autogenerated by Howl.`;

export async function hashContent(
  // deno-lint-ignore no-explicit-any
  content: Uint8Array<any> | ReadableStream<Uint8Array>,
): Promise<string> {
  const buffer = await new Response(content).arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buffer);
  return encodeHex(hashBuf);
}

export function getContentType(filePath: string): string {
  const ext = path.extname(filePath);
  return getStdContentType(ext) ?? "text/plain";
}

function maybeToFileUrl(file: string) {
  return file.startsWith("file://") ? file : path.toFileUrl(file).href;
}

export interface PendingStaticFile {
  pathname: string;
  filePath: string;
  hash: string | null;
}

export async function writeCompiledEntry(outDir: string) {
  await Deno.writeTextFile(
    path.join(outDir, "compiled-entry.js"),
    `import fetcher from "./server.js";

const rawPort = Deno.env.get("DENO_PORT");
const port = rawPort !== undefined && rawPort !== "" ? Number(rawPort) : undefined;
if (port !== undefined && Number.isNaN(port)) {
  throw new Error(\`DENO_PORT must be numeric, got: \${rawPort}\`);
}

Deno.serve(
  {
    port,
    hostname: Deno.env.get("DENO_HOSTNAME"),
    onListen: ({ hostname, port }) => {
      console.log(\`Server is running on http://\${hostname}:\${port}\`);
    },
  },
  fetcher.fetch,
);
`,
  );
}

export async function generateSnapshotServer(
  options: {
    outDir: string;
    buildId: string;
    clientEntry: string;
    islands: IslandModChunk[];
    // deno-lint-ignore no-explicit-any
    fsRoutesFiles: FsRouteFileNoMod<any>[];
    apiRoutes: unknown[];
    apiEntries: ApiEntry[];
    staticFiles: PendingStaticFile[];
    entryAssets: string[];
    aotRoutes: Map<string, string>;
    ssgPages: Map<string, string>;
    writeSpecifier: (filePath: string) => string;
  },
): Promise<string> {
  const { islands, writeSpecifier, fsRoutesFiles, outDir } = options;

  const islandImports = islands
    .map((item) => {
      const spec = writeSpecifier(item.server);
      return `import * as ${item.name} from "${spec}";`;
    })
    .join("\n");

  // Always emit static imports for every fs route in the prod snapshot.
  // Dynamic `() => import("../client/pages/foo.tsx")` factories break under
  // `deno compile` — relative paths to embedded .tsx files don't resolve at
  // runtime, so the route silently fails to register and every request
  // falls through to DEFAULT_NOT_FOUND. Static imports get bundled by the
  // build and are guaranteed to work in compiled binaries.
  const fsRouteImports = fsRoutesFiles
    .map((item, i) => {
      const spec = writeSpecifier(item.filePath);
      return `import * as fsRoute_${i} from "${spec}"`;
    })
    .join("\n");

  const islandMarkers = islands.map((item) => {
    const browser = JSON.stringify(item.browser);
    const name = JSON.stringify(item.name);
    const css = JSON.stringify(item.css);
    return `islandPreparer.prepare(islands, ${item.name}, ${browser}, ${name}, ${css});`;
  }).join("\n");

  const serializedFsRoutes = fsRoutesFiles
    .map((item, i) => {
      const id = JSON.stringify(item.id);
      const pattern = JSON.stringify(item.pattern);
      const type = JSON.stringify(item.type);
      const routePattern = JSON.stringify(item.routePattern);

      const mod = `fsRoute_${i}`;

      return `  { id: ${id}, mod: ${mod}, type: ${type}, pattern: ${pattern}, routePattern: ${routePattern} },`;
    })
    .join("\n");

  const staticFiles = await Promise.all(
    options.staticFiles.map((item) => prepareStaticFile(item, outDir)),
  );

  const entryAssets = options.entryAssets.map((url) => JSON.stringify(url))
    .join(",\n");

  // Generate imports for API modules so handlers survive into the compiled binary
  const apiImports = options.apiEntries
    .map((entry, i) => {
      const spec = writeSpecifier(entry.filePath);
      return `import _api_${i} from "${spec}";`;
    })
    .join("\n");

  const serializedApiRoutes = options.apiEntries.length > 0
    ? options.apiEntries.map((entry, i) => {
      if (entry.overridePath) {
        return `  { ..._api_${i}, path: ${JSON.stringify(entry.overridePath)} }`;
      }
      return `  _api_${i}`;
    }).join(",\n")
    : options.apiRoutes.map((api) => {
      // deno-lint-ignore no-explicit-any
      const { handler: _h, ...meta } = api as any;
      return JSON.stringify(meta);
    }).join(",\n");

  const serializedAotRoutes = Array.from(options.aotRoutes.entries())
    .map(([pattern, chunkUrl]) =>
      `  [${JSON.stringify(pattern)}, ${JSON.stringify(chunkUrl)}],`
    )
    .join("\n");

  const serializedSsgPages = Array.from(options.ssgPages.entries())
    .map(([pattern, html]) =>
      `  [${JSON.stringify(pattern)}, ${JSON.stringify(html)}],`
    )
    .join("\n");

  return `${EDIT_WARNING}
import { IslandPreparer } from "@hushkey/howl";
${islandImports}
${apiImports}
${fsRouteImports}

export const clientEntry = ${JSON.stringify(options.clientEntry)}
export const version = ${JSON.stringify(options.buildId)}

export const islands = new Map();
const islandPreparer = new IslandPreparer();
${islandMarkers}

export const staticFiles = new Map([
${staticFiles.map((def) => `  [${JSON.stringify(def.name)}, ${JSON.stringify(def)}]`).join(",\n")}
]);

export const entryAssets = [${entryAssets}];

export const aotRoutes = new Map([
${serializedAotRoutes}
]);

export const ssgPages = new Map([
${serializedSsgPages}
]);

export const fsRoutes = [
${serializedFsRoutes}
];

export const apiRoutes = [
${serializedApiRoutes}
];
`.replaceAll(/\n[\n]+/g, "\n\n");
}

export async function prepareStaticFile(
  item: PendingStaticFile,
  outDir: string,
): Promise<{ name: string; hash: string; filePath: string; contentType: string }> {
  const file = await Deno.open(item.filePath);
  const hash = item.hash ? item.hash : await hashContent(file.readable);
  const url = new URL(item.pathname, "http://localhost");

  return {
    name: url.pathname,
    hash,
    filePath: path.isAbsolute(item.filePath) ? path.relative(outDir, item.filePath) : item.filePath,
    contentType: getContentType(item.filePath),
  };
}

export function generateServerEntry(
  options: {
    root: string;
    serverEntry: string;
    snapshotSpecifier: string;
    hasApiRoutes: boolean;
  },
): string {
  let rootPath = `path.join(import.meta.dirname, ${JSON.stringify(options.root)})`;
  if (path.isAbsolute(options.root)) {
    // deno-lint-ignore no-console
    console.warn(`WARN: using absolute root path in snapshot: "${options.root}"`);
    rootPath = JSON.stringify(options.root);
  }

  const apiImport = options.hasApiRoutes ? `import { apiHandler } from "@hushkey/howl/api";` : "";

  const apiRegistration = options.hasApiRoutes
    ? `
if (snapshot.apiRoutes.length > 0 && app.isApiRoutesEnabled()) {
  apiHandler(app, snapshot.apiRoutes, app.getApiConfig());
}
`
    : "";

  return `${EDIT_WARNING}
import { setBuildCache, ProdBuildCache } from "@hushkey/howl";
import * as path from "@std/path";
import * as snapshot from "${options.snapshotSpecifier}";
import { app } from "${options.serverEntry}";
${apiImport}

const root = ${rootPath};
setBuildCache(app, new ProdBuildCache(root, snapshot), "production");
${apiRegistration}
export default {
  fetch: app.handler()
};
`;
}

function getClientEntry(buildId: string) {
  return `/_howl/js/${buildId}/howl-runtime.js`;
}
