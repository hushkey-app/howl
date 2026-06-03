import { globToRegExp, isGlob } from "@std/path";
import type { FsAdapter } from "../core/fs.ts";
import { BUILD_ID } from "../utils/build-id.ts";
import { assetInternal } from "../core/asset_lock.ts";

export type TransformMode = "development" | "production";

/**
 * Options describing which files a transformer should run for.
 */
export interface OnTransformOptions {
  /** Plugin name surfaced in errors and traces. */
  pluginName: string;
  /** RegExp matched against file paths to opt the file in. */
  filter: RegExp;
  /** Patterns (RegExp or glob) that opt files back out. */
  exclude?: Array<string | RegExp>;
}

/**
 * Result returned from a {@linkcode TransformFn} for a single output file.
 */
export interface OnTransformResult {
  /** New file contents (string is encoded as UTF-8). */
  content: string | Uint8Array;
  /** Optional rewritten output path. */
  path?: string;
  /** Optional source map (raw JSON or bytes). */
  map?: string | Uint8Array;
}

/**
 * Arguments passed to a {@linkcode TransformFn}.
 */
export interface OnTransformArgs {
  /** Absolute file path being transformed. */
  path: string;
  /** esbuild `target` value(s) for the active build. */
  target: string | string[];
  /** UTF-8 decoded file contents. */
  text: string;
  /** Raw file contents. */
  content: Uint8Array;
  /** Active build mode (`development` or `production`). */
  mode: TransformMode;
  /** Project root the build is running against. */
  root: string;
}
/**
 * Callback signature for {@linkcode FileTransformer.onTransform}. Receives the
 * file being processed and returns one (or more) replacement files, or
 * nothing to leave the file untouched.
 */
export type TransformFn = (
  args: OnTransformArgs,
) =>
  | void
  | OnTransformResult
  | Array<{ path: string } & Omit<OnTransformResult, "path">>
  | Promise<
    | void
    | OnTransformResult
    | Array<{ path: string } & Omit<OnTransformResult, "path">>
  >;

/** A registered transformer — its match options paired with its callback. */
export interface Transformer {
  /** Match options selected for this transformer. */
  options: OnTransformOptions;
  /** Callback invoked for each matching file. */
  fn: TransformFn;
}

/** A processed output file produced by the {@linkcode FileTransformer}. */
export interface ProcessedFile {
  /** Output path (post-transform). */
  path: string;
  /** Encoded contents. */
  content: Uint8Array;
  /** Optional source map bytes. */
  map: Uint8Array | null;
  /** Input file paths that contributed to this output. */
  inputFiles: string[];
}

interface TransformReq {
  newFile: boolean;
  filePath: string;
  content: Uint8Array;
  map: null | Uint8Array;
  inputFiles: string[];
}

/**
 * Pipeline that runs registered {@linkcode Transformer}s against files on
 * disk and returns the processed outputs.
 */
export class FileTransformer {
  #transformers: Transformer[] = [];
  #fs: FsAdapter;
  #root: string;

  /** Build a transformer bound to the given filesystem adapter and root. */
  constructor(fs: FsAdapter, root: string) {
    this.#fs = fs;
    this.#root = root;
  }

  /** Register a transformer callback for files matching `options`. */
  onTransform(options: OnTransformOptions, callback: TransformFn): void {
    this.#transformers.push({ options, fn: callback });
  }

  /**
   * Read `filePath`, run every matching transformer, and return the
   * resulting output files. Returns `null` if no transformer matched.
   */
  async process(
    filePath: string,
    mode: TransformMode,
    target: string | string[],
  ): Promise<ProcessedFile[] | null> {
    // Pre-check if we have any transformer for this file at all
    let hasTransformer = false;
    for (let i = 0; i < this.#transformers.length; i++) {
      if (this.#transformers[i].options.filter.test(filePath)) {
        hasTransformer = true;
        break;
      }
    }

    if (!hasTransformer) {
      return null;
    }

    let content: Uint8Array;
    try {
      content = await this.#fs.readFile(filePath);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return null;
      }

      throw err;
    }

    const queue: TransformReq[] = [{
      newFile: false,
      content,
      filePath,
      map: null,
      inputFiles: [filePath],
    }];
    const outFiles: ProcessedFile[] = [];

    const seen = new Set<string>();

    let req: TransformReq | undefined = undefined;
    while ((req = queue.pop()) !== undefined) {
      if (seen.has(req.filePath)) continue;
      seen.add(req.filePath);

      let transformed = false;
      outer: for (let i = 0; i < this.#transformers.length; i++) {
        const transformer = this.#transformers[i];

        const { options, fn } = transformer;
        options.filter.lastIndex = 0;
        if (!options.filter.test(req.filePath)) {
          continue;
        }

        // Check if file is excluded
        if (options.exclude !== undefined) {
          for (let j = 0; j < options.exclude.length; j++) {
            const exclude = options.exclude[j];
            if (exclude instanceof RegExp) {
              if (exclude.test(filePath)) {
                continue outer;
              }
            } else if (isGlob(exclude)) {
              const regex = globToRegExp(exclude);
              if (regex.test(filePath)) {
                continue outer;
              }
            } else if (filePath.includes(exclude)) {
              continue outer;
            }
          }
        }

        const result = await fn({
          path: req.filePath,
          mode,
          target,
          content: req!.content,
          root: this.#root,
          get text() {
            return new TextDecoder().decode(req!.content);
          },
        });

        if (result !== undefined) {
          if (Array.isArray(result)) {
            for (let i = 0; i < result.length; i++) {
              const item = result[i];
              if (item.path === undefined) {
                throw new Error(
                  `The ".path" property must be set when returning multiple files in a transformer. [${transformer.options.pluginName}]`,
                );
              }

              const outContent = typeof item.content === "string"
                ? new TextEncoder().encode(item.content)
                : item.content;

              const outMap = item.map !== undefined
                ? typeof item.map === "string" ? new TextEncoder().encode(item.map) : item.map
                : null;

              if (req.filePath === item.path) {
                if (req.content === outContent && req.map === outMap) {
                  continue;
                }

                transformed = true;
                req.content = outContent;
                req.map = outMap;
              } else {
                let found = false;
                for (let i = 0; i < queue.length; i++) {
                  const req = queue[i];
                  if (req.filePath === item.path) {
                    found = true;
                    transformed = true;
                    req.content = outContent;
                    req.map = outMap;
                  }
                }

                if (!found) {
                  queue.push({
                    newFile: true,
                    filePath: item.path,
                    content: outContent,
                    map: outMap,
                    inputFiles: req.inputFiles.slice(),
                  });
                }
              }
            }
          } else {
            const outContent = typeof result.content === "string"
              ? new TextEncoder().encode(result.content)
              : result.content;

            const outMap = result.map !== undefined
              ? typeof result.map === "string" ? new TextEncoder().encode(result.map) : result.map
              : null;

            if (req.content === outContent && req.map === outMap) {
              continue;
            }

            transformed = true;
            req.content = outContent;
            req.map = outMap;
            req.filePath = result.path ?? req.filePath;
          }
        }
      }

      // TODO: Keep transforming until no one processes anymore
      if (transformed || req.newFile) {
        outFiles.push({
          content: req.content,
          map: req.map,
          path: req.filePath,
          inputFiles: req.inputFiles,
        });
      }
    }

    return outFiles.length > 0 ? outFiles : null;
  }
}

const CSS_URL_REGEX = /url\(("[^"]+"|'[^']+'|[^)]+)\)/g;

export function cssAssetHash(transformer: FileTransformer) {
  transformer.onTransform({
    pluginName: "howl-css",
    filter: /\.css$/,
  }, (args) => {
    const replaced = args.text.replaceAll(CSS_URL_REGEX, (_, str) => {
      let rawUrl = str;
      if (str[0] === "'" || str[0] === '"') {
        rawUrl = str.slice(1, -1);
      }

      if (rawUrl.length === 0) {
        return str;
      }

      return `url(${JSON.stringify(assetInternal(rawUrl, BUILD_ID))})`;
    });

    return {
      content: replaced,
    };
  });
}
