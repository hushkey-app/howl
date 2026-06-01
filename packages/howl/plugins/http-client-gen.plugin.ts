// deno-lint-ignore-file no-explicit-any
import path from "node:path";
import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Configuration for {@linkcode buildHttpClient} and {@linkcode httpClientGenPlugin}.
 * Crawls `*.api.ts` files under `apiDir` and emits a typed http client to `outputFile`.
 */
export interface BuildHttpClientConfig {
  /** Directory containing `*.api.ts` files. Absolute or relative to cwd. */
  apiDir: string;
  /** Output path for the generated client. Defaults to `packages/http-client/mod.ts`. */
  outputFile?: string;
  /** Import alias map, e.g. `{ '@packages/': '../../packages/' }`. Resolved relative to cwd. */
  aliases?: Record<string, string>;
}

// ─── State (reset on each build) ─────────────────────────────────────────────

const apiTree: Record<string, any> = {};
const apiSpecs: Map<string, {
  importPath: string;
  requestBody?: z.ZodObject<any, any> | z.ZodUnion<any> | null;
  requestBodySource?: string | null;
  responses?: Record<number, z.ZodObject<any, any>>;
  params?: z.ZodObject<any, any> | null;
}> = new Map();

const schemaDeps = new Map<string, string>();

/** Active alias map populated from config: { '@packages/': '/abs/path/to/packages/' } — absolute values */
const activeAliases: Record<string, string> = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRequestBodySchema(
  schema: unknown,
): schema is z.ZodObject<any, any> | z.ZodUnion<any> {
  if (!schema || typeof schema !== "object") return false;
  if (schema instanceof z.ZodObject) return true;
  const s = schema as {
    _def?: { typeName?: string; options?: unknown[] };
    def?: { typeName?: string; options?: unknown[] };
  };
  const def = s._def ?? s.def;
  return def?.typeName === "ZodUnion" || (Array.isArray(def?.options) && def.options.length > 0);
}

function addToTree(tree: any, pathArr: string[], method: string, apiPath: string, name: string) {
  if (pathArr.length === 0) return;
  const [head, ...rest] = pathArr;
  if (!tree[head]) tree[head] = {};
  if (rest.length === 0) {
    tree[head][`$${method.toLowerCase()}`] = `__FETCH__${method}__${apiPath}__${name}`;
  } else {
    addToTree(tree[head], rest, method, apiPath, name);
  }
}

async function* walkDirectory(
  dirPath: string,
): AsyncGenerator<{ path: string; name: string; isFile: boolean }> {
  try {
    for await (const entry of Deno.readDir(dirPath)) {
      const fullPath = path.join(dirPath, entry.name);
      yield { path: fullPath, name: entry.name, isFile: entry.isFile };
      if (entry.isDirectory) yield* walkDirectory(fullPath);
    }
  } catch { /* ignore */ }
}

const ZOD_BUILTINS = new Set([
  "z",
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "enum",
  "optional",
  "default",
  "any",
  "literal",
  "union",
  "null",
  "undefined",
  "describe",
  "min",
  "max",
  "email",
  "toLowerCase",
  "nullable",
  "nullish",
  "transform",
  "refine",
  "pipe",
  "strict",
  "catch",
  "brand",
  "readonly",
]);

function extractRequestBodySource(fileContent: string): string | null {
  const match = fileContent.match(/\brequestBody\s*:/);
  if (!match || match.index === undefined) return null;
  let i = match.index + match[0].length;
  while (i < fileContent.length && /[\s\n\r]/.test(fileContent[i])) i++;
  if (i >= fileContent.length) return null;
  if (fileContent.slice(i, i + 9) === "undefined") return null;
  const start = i;
  while (i < fileContent.length && fileContent[i] !== "(") i++;
  if (i >= fileContent.length) return null;
  let depth = 1;
  i++;
  while (i < fileContent.length && depth > 0) {
    const c = fileContent[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    i++;
  }
  return fileContent.slice(start, i).trim() || null;
}

function extractSchemaRefsFromSource(source: string): string[] {
  const words = source.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) ?? [];
  return [...new Set(words)].filter((w) => !ZOD_BUILTINS.has(w));
}

function extractExportConstSource(fileContent: string, exportName: string): string | null {
  const pattern = new RegExp(`\\bexport\\s+const\\s+${exportName}\\s*=\\s*`, "g");
  const match = pattern.exec(fileContent);
  if (!match || match.index === undefined) return null;
  let i = match.index + match[0].length;
  const start = i;
  const open = ["(", "[", "{"];
  const close = [")", "]", "}"];
  const stack: string[] = [];
  let inString: string | null = null;
  while (i < fileContent.length) {
    const c = fileContent[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      i++;
      continue;
    }
    const oi = open.indexOf(c);
    if (oi >= 0) {
      stack.push(close[oi]);
      i++;
      continue;
    }
    if (stack.length > 0 && c === stack[stack.length - 1]) {
      stack.pop();
      i++;
      continue;
    }
    if (stack.length === 0 && (c === ";" || c === "\n")) return fileContent.slice(start, i).trim();
    i++;
  }
  return stack.length === 0 ? fileContent.slice(start, i).trim() : null;
}

function resolveSchemaRef(
  identifier: string,
  apiFileContent: string,
  apiFileDir: string,
  currentDir: string,
  visited: Set<string>,
): string | null {
  if (visited.has(identifier)) return null;
  visited.add(identifier);

  const constMatch = apiFileContent.match(new RegExp(`\\bconst\\s+${identifier}\\s*=\\s*`, "g"));
  if (constMatch) {
    const idx = apiFileContent.indexOf(constMatch[0]);
    let i = idx + constMatch[0].length;
    const start = i;
    const open = ["(", "[", "{"];
    const close = [")", "]", "}"];
    const stack: string[] = [];
    let inString: string | null = null;
    while (i < apiFileContent.length) {
      const c = apiFileContent[i];
      if (inString) {
        if (c === "\\") i++;
        else if (c === inString) inString = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inString = c;
        i++;
        continue;
      }
      const oi = open.indexOf(c);
      if (oi >= 0) {
        stack.push(close[oi]);
        i++;
        continue;
      }
      if (stack.length > 0 && c === stack[stack.length - 1]) {
        stack.pop();
        i++;
        continue;
      }
      if (stack.length === 0 && (c === ";" || c === "\n")) {
        const src = apiFileContent.slice(start, i).trim();
        // Only treat as a schema dep if it looks like a Zod expression
        return /^z\./.test(src) ? src : null;
      }
      i++;
    }
    if (stack.length === 0) {
      const src = apiFileContent.slice(start, i).trim();
      return /^z\./.test(src) ? src : null;
    }
    return null;
  }

  const importMatch = apiFileContent.match(
    new RegExp(`import\\s+\\{[^}]*\\b${identifier}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`),
  );
  if (importMatch) {
    const rawPath = importMatch[1].replace(/\.ts$/, "") + ".ts";
    const aliasEntry = Object.entries(activeAliases).find(([prefix]) => rawPath.startsWith(prefix));
    const absPath = rawPath.startsWith("@server/")
      ? path.join(currentDir, rawPath.replace(/^@server\/?/, "server/"))
      : aliasEntry
      ? path.join(aliasEntry[1], rawPath.slice(aliasEntry[0].length))
      : path.resolve(apiFileDir, rawPath);
    try {
      const depContent = Deno.readTextFileSync(absPath);
      const depDir = path.dirname(absPath);
      const source = extractExportConstSource(depContent, identifier);
      if (source) {
        for (const ref of extractSchemaRefsFromSource(source)) {
          if (!schemaDeps.has(ref)) {
            const nested = resolveSchemaRef(ref, depContent, depDir, currentDir, new Set());
            if (nested) schemaDeps.set(ref, nested);
          }
        }
        return source;
      }
    } catch { /* file not found */ }
  }
  return null;
}

// ─── Zod → TypeScript type string ────────────────────────────────────────────

function zodSchemaToTypeString(schema: z.ZodTypeAny | null | undefined): string {
  if (!schema) return "any";
  try {
    const def = (schema as any)._def ?? (schema as any).def;
    if (!def) return "any";
    const type = def.type ?? def.typeName;

    if (type === "ZodObject" || type === "object") {
      let shape = def.shape;
      if (typeof shape === "function") shape = shape();
      if (!shape && (schema as any).shape) {
        shape = (schema as any).shape;
        if (typeof shape === "function") shape = shape();
      }
      if (!shape || Object.keys(shape).length === 0) return "Record<string, any>";
      const props = Object.keys(shape).map((key) => {
        const v = shape[key] as any;
        const vDef = v._def ?? v.def;
        const vType = vDef?.type ?? vDef?.typeName;
        const isOpt = vType === "ZodOptional" || vType === "ZodDefault" || vType === "optional" ||
          vType === "default";
        const inner = isOpt ? (vDef?.innerType ?? v) : v;
        return isOpt
          ? `${key}?: ${zodSchemaToTypeString(inner)}`
          : `${key}: ${zodSchemaToTypeString(inner)}`;
      });
      return `{ ${props.join("; ")} }`;
    }
    if (type === "ZodString" || type === "string") return "string";
    if (type === "ZodNumber" || type === "number") return "number";
    if (type === "ZodBoolean" || type === "boolean") return "boolean";
    if (type === "ZodArray" || type === "array") {
      return `Array<${zodSchemaToTypeString(def.element ?? def.type)}>`;
    }
    if (type === "ZodOptional") return zodSchemaToTypeString(def.innerType);
    if (type === "ZodDefault") return zodSchemaToTypeString(def.innerType);
    if (type === "ZodEnum") return (def.values as string[]).map((v) => `'${v}'`).join(" | ");
    if (type === "ZodUnion") {
      return (def.options as z.ZodTypeAny[]).map(zodSchemaToTypeString).join(" | ");
    }
    if (type === "ZodLiteral") {
      return typeof def.value === "string" ? `'${def.value}'` : String(def.value);
    }
    if (type === "ZodAny" || type === "any") return "any";
    return "any";
  } catch {
    return "any";
  }
}

// ─── Zod → standalone z.*() source code ──────────────────────────────────────

function zodSchemaToSourceCode(schema: z.ZodTypeAny | null | undefined): string {
  if (!schema) return "z.any()";
  try {
    const def = (schema as any)._def ?? (schema as any).def;
    if (!def) return "z.any()";
    const type = def.type ?? def.typeName;

    if (type === "ZodObject" || type === "object") {
      let shape = def.shape;
      if (typeof shape === "function") shape = shape();
      if (!shape || Object.keys(shape).length === 0) return "z.record(z.any())";
      const entries = Object.entries(shape)
        .filter(([, v]) => v != null)
        .map(([k, v]) => {
          const vAny = v as any;
          const vDef = vAny._def ?? vAny.def;
          const vType = vDef?.type ?? vDef?.typeName;
          const isOpt = vType === "ZodOptional" || vType === "ZodDefault" || vType === "optional" ||
            vType === "default";
          const inner = isOpt ? (vDef?.innerType ?? v) : v;
          return isOpt
            ? `${JSON.stringify(k)}: z.optional(${zodSchemaToSourceCode(inner)})`
            : `${JSON.stringify(k)}: ${zodSchemaToSourceCode(inner)}`;
        });
      return `z.object({ ${entries.join(", ")} })`;
    }
    if (type === "ZodString" || type === "string") return "z.string()";
    if (type === "ZodNumber" || type === "number") return "z.number()";
    if (type === "ZodBoolean" || type === "boolean") return "z.boolean()";
    if (type === "ZodAny" || type === "any") return "z.any()";
    if (type === "ZodArray" || type === "array") {
      return `z.array(${zodSchemaToSourceCode(def.element ?? def.type)})`;
    }
    if (type === "ZodOptional") return `z.optional(${zodSchemaToSourceCode(def.innerType)})`;
    if (type === "ZodDefault") {
      const inner = zodSchemaToSourceCode(def.innerType);
      const dv = def.defaultValue;
      if (typeof dv === "string") return `z.default(${inner}, ${JSON.stringify(dv)})`;
      if (typeof dv === "number" || typeof dv === "boolean") return `z.default(${inner}, ${dv})`;
      return `z.default(${inner})`;
    }
    if (type === "ZodEnum") {
      return `z.enum([${(def.values as string[]).map((v) => JSON.stringify(v)).join(", ")}])`;
    }
    if (type === "ZodUnion") {
      return `z.union([${(def.options as z.ZodTypeAny[]).map(zodSchemaToSourceCode).join(", ")}])`;
    }
    if (type === "ZodLiteral") {
      return typeof def.value === "string"
        ? `z.literal(${JSON.stringify(def.value)})`
        : `z.literal(${def.value})`;
    }
    return "z.any()";
  } catch {
    return "z.any()";
  }
}

// ─── Code generation ──────────────────────────────────────────────────────────

function generateFetchFn(method: string, apiPath: string, name: string): string {
  const spec = apiSpecs.get(name);
  if (!spec) throw new Error(`API spec not found for: ${name}`);

  let paramsType = "params?: Record<string, string>";
  if (apiPath.includes(":") || (spec.params instanceof z.ZodObject)) {
    paramsType = `params?: __${name}_params_type`;
  }

  let bodyType = "body?: Record<string, any>";
  if (spec.requestBody && isRequestBodySchema(spec.requestBody)) {
    bodyType = `body?: __${name}_requestBody_type`;
  }

  let responseType = "any";
  if (spec.responses) {
    const firstKey = Object.keys(spec.responses)[0];
    if (firstKey && spec.responses[Number(firstKey)] instanceof z.ZodObject) {
      responseType = `__${name}_response_${firstKey}_type`;
    }
  }

  return `
    async function $${method.toLowerCase()}(init: { ${paramsType}, query?: Record<string, string>, headers?: RequestInit['headers'], ${bodyType}, origin?: 'client' | 'server' } = {}): Promise<${responseType}> {
      return await __fetch("${method.toUpperCase()}", \`${apiPath}\`, init);
    }
  `;
}

function generateTypeDefs(): string {
  const lines: string[] = [];
  for (const [name, spec] of apiSpecs) {
    if (spec.params instanceof z.ZodObject) {
      lines.push(`type __${name}_params_type = ${zodSchemaToTypeString(spec.params)};`);
    }
    if (spec.requestBody && isRequestBodySchema(spec.requestBody)) {
      lines.push(`type __${name}_requestBody_type = ${zodSchemaToTypeString(spec.requestBody)};`);
    }
    if (spec.responses) {
      for (const [code, schema] of Object.entries(spec.responses)) {
        if (schema instanceof z.ZodObject) {
          lines.push(`type __${name}_response_${code}_type = ${zodSchemaToTypeString(schema)};`);
        }
      }
    }
  }
  return lines.join("\n");
}

function generateSchemaDepsCode(): string {
  if (schemaDeps.size === 0) return "";
  return [...schemaDeps.entries()].map(([n, src]) => `const ${n} = ${src};`).join("\n") + "\n";
}

function toCamelCase(name: string): string {
  return name.split("_").map((p, i) =>
    i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
  ).join("");
}

function generateValidationsCode(): string {
  const entries: string[] = [];
  for (const [name, spec] of apiSpecs) {
    if (!spec.requestBody || !isRequestBodySchema(spec.requestBody)) continue;
    const code = spec.requestBodySource ?? zodSchemaToSourceCode(spec.requestBody);
    entries.push(`  "${toCamelCase(name)}": ${code}`);
  }
  return entries.length === 0 ? "{}" : `{\n${entries.join(",\n")}\n}`;
}

function generateValidationsTypeInterface(): string {
  const entries: string[] = [];
  for (const [name, spec] of apiSpecs) {
    if (!spec.requestBody || !isRequestBodySchema(spec.requestBody)) continue;
    entries.push(`  ${toCamelCase(name)}: __${name}_requestBody_type;`);
  }
  return entries.length === 0
    ? ""
    : `\nexport interface HttpValidationTypes {\n${entries.join("\n")}\n}\n`;
}

function treeToCode(tree: any): string {
  let code = "{\n";
  for (const key in tree) {
    const safeKey = `"${key}"`;
    const val = tree[key];
    if (typeof val === "string" && val.startsWith("__FETCH__")) {
      const [method, apiPath, name] = val.replace("__FETCH__", "").split("__");
      try {
        code += `  ${safeKey}: ${generateFetchFn(method, apiPath, name)},\n`;
      } catch (err) {
        console.warn(`[http-client] Failed to generate fn for ${name}:`, err);
        code +=
          `  ${safeKey}: { async $${method.toLowerCase()}(init: any = {}): Promise<any> { return await __fetch("${method.toUpperCase()}", \`${apiPath}\`, init); } },\n`;
      }
    } else {
      code += `  ${safeKey}: ${treeToCode(val)},\n`;
    }
  }
  return code + "}";
}

// ─── Core build function ──────────────────────────────────────────────────────

/**
 * Crawls API files under `config.apiDir`, extracts Zod schemas + route metadata, and writes
 * a typed http client module to `config.outputFile`. The generated module exports a tree-shaped
 * `http` object whose leaves are `$get/$post/...` fetch helpers typed against the route's
 * params, request body, and 2xx response schemas.
 *
 * Safe to call repeatedly — internal state is reset on each invocation.
 */
export async function buildHttpClient(config: BuildHttpClientConfig): Promise<void> {
  const { apiDir, outputFile = "packages/http-client/mod.ts" } = config;
  const start = Date.now();
  const cwd = Deno.cwd();
  const apiDirPath = path.isAbsolute(apiDir) ? apiDir : path.join(cwd, apiDir);
  const outputPath = path.isAbsolute(outputFile) ? outputFile : path.join(cwd, outputFile);

  // Reset state
  Object.keys(apiTree).forEach((k) => delete apiTree[k]);
  Object.keys(activeAliases).forEach((k) => delete activeAliases[k]);
  apiSpecs.clear();
  schemaDeps.clear();

  // Resolve aliases to absolute paths
  if (config.aliases) {
    for (const [prefix, rel] of Object.entries(config.aliases)) {
      activeAliases[prefix] = path.isAbsolute(rel) ? rel : path.resolve(cwd, rel);
    }
  }

  try {
    await Deno.stat(apiDirPath);
  } catch {
    console.warn(`[http-client] API directory not found: ${apiDirPath}. Skipping.`);
    return;
  }

  let processed = 0, skipped = 0;

  for await (const entry of walkDirectory(apiDirPath)) {
    if (!entry.isFile || !entry.name.endsWith(".api.ts")) continue;
    try {
      const fileUrl = `file://${path.resolve(entry.path).replace(/\\/g, "/")}`;
      const api = await import(fileUrl);

      if (!api.default) {
        console.warn(`[http-client] Skipping ${entry.path}: no default export`);
        skipped++;
        continue;
      }

      const { method, path: explicitPath, name: apiName, requestBody, responses, params } =
        api.default;
      if (!method || !apiName) {
        console.warn(`[http-client] Skipping ${entry.path}: missing fields (need method, name)`);
        skipped++;
        continue;
      }

      const name = apiName.toLowerCase().replace(/\s+/g, "_");

      // Use explicit path if provided, otherwise derive from file location
      const relFromApiDir = path.relative(apiDirPath, entry.path);
      const fsPath = "/api/" + relFromApiDir
        .replace(/\\/g, "/")
        .replace(/\.api\.ts$/, "")
        .split("/")
        .filter((s) => s !== "index")
        .map((s) => s.replace(/^\[(.+)\]$/, ":$1"))
        .join("/");

      const rel = path.relative(cwd, entry.path);
      const importPath = `@server/apis/${rel.replace(/\\/g, "/").replace(/^server\/apis\//, "")}`;

      let requestBodySource: string | null = null;
      if (requestBody) {
        try {
          const content = await Deno.readTextFile(entry.path);
          requestBodySource = extractRequestBodySource(content);
          if (requestBodySource) {
            const dir = path.dirname(entry.path);
            for (const ref of extractSchemaRefsFromSource(requestBodySource)) {
              if (!schemaDeps.has(ref)) {
                const src = resolveSchemaRef(ref, content, dir, cwd, new Set());
                if (src) schemaDeps.set(ref, src);
              }
            }
          }
        } catch { /* keep null */ }
      }

      if (apiSpecs.has(name)) throw new Error(`Duplicate API name: ${name}`);
      apiSpecs.set(name, {
        importPath,
        requestBody: requestBody ?? null,
        requestBodySource: requestBodySource ?? null,
        responses: responses ?? undefined,
        params: params ?? null,
      });

      const resolvedPaths: string[] = explicitPath
        ? (Array.isArray(explicitPath) ? explicitPath : [explicitPath])
        : [fsPath];

      for (const p of resolvedPaths) {
        if (typeof p !== "string") continue;
        addToTree(apiTree, p.split("/").filter(Boolean), method, p, name);
      }
      processed++;
    } catch (err) {
      console.warn(`[http-client] Failed to process ${entry.path}:`, err);
      skipped++;
    }
  }

  console.log(`[http-client] Processed ${processed} API files, skipped ${skipped}`);

  const clientCode = `// AUTO-GENERATED — do not edit
// deno-lint-ignore-file no-explicit-any
import { z } from 'zod';
${generateTypeDefs()}
${generateSchemaDepsCode()}
${generateValidationsTypeInterface()}
async function __fetch<T = any>(
  method: string,
  path: string,
  init: { params?: Record<string, string>; query?: Record<string, string>; headers?: RequestInit['headers']; body?: any; origin?: 'client' | 'server' } = { origin: 'client' },
): Promise<T & { ok?: boolean; status?: number }> {
  let finalPath = path;
  if (init.params && Object.keys(init.params).length > 0) {
    finalPath = finalPath.replace(/:(\\w+)/g, (_: string, p: string) => init.params![p] ?? \`:\${p}\`);
  }
  if (init.query && Object.keys(init.query).length > 0) {
    finalPath += '?' + new URLSearchParams(init.query).toString();
  }
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  };
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = JSON.stringify(init.body ?? {});
  } else if (method === 'DELETE' && init.body) {
    options.body = JSON.stringify(init.body);
  }
  if (init.origin === 'server') {
    const apiUrl = Deno.env.get('DENO_API_URL');
    if (!apiUrl) throw new Error('DENO_API_URL is not set');
    finalPath = apiUrl + finalPath;
  }
  const res = await fetch(finalPath, options);
  if (!res.ok) {
    let message = 'Request failed';
    try {
      const body = await res.json();
      if (typeof body?.error === 'string') message = body.error;
      else if (typeof body?.message === 'string') message = body.message;
    } catch { /* non-JSON error body */ }
    throw new Error(message);
  }
  if (res.status === 204) return res as any;
  return { ok: res.ok, status: res.status, ...(await res.json()) };
}

export const http = (() => {
  const tree = ${treeToCode(apiTree)};
  const validations = ${generateValidationsCode()};
  return { ...tree, validations };
})();
`;

  await Deno.mkdir(path.dirname(outputPath), { recursive: true });
  await Deno.writeTextFile(outputPath, clientCode.trim() + "\n");
  console.log(`[http-client] Generated in ${Date.now() - start}ms → ${outputPath}`);
}

// ─── esbuild plugin ───────────────────────────────────────────────────────────

/**
 * esbuild plugin wrapping {@linkcode buildHttpClient}. Regenerates the typed http
 * client on every build start. Errors are logged but do not abort the build.
 *
 * @example
 * // In dev.ts:
 * import { httpClientGenPlugin } from "@hushkey/howl/plugins";
 *
 * const builder = new HowlBuilder(app, {
 *   root: import.meta.dirname,
 *   importApp: async () => (await import("./main.ts")).app,
 *   plugins: [httpClientGenPlugin({ apiDir: "./server/apis" })],
 * });
 */
export function httpClientGenPlugin(config: BuildHttpClientConfig): {
  name: string;
  setup: (build: { onStart: (cb: () => Promise<void> | void) => void }) => void;
} {
  return {
    name: "build-http-client",
    setup(build: { onStart: (cb: () => Promise<void> | void) => void }) {
      build.onStart(async () => {
        try {
          await buildHttpClient(config);
        } catch (err) {
          console.error("[http-client] Build failed:", err);
        }
      });
    },
  };
}
