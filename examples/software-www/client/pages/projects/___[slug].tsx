import { HttpError } from "@hushkey/howl/client";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "../../../howl.config.ts";
import type { BlockType } from "../../../server/cv/reader.ts";
import { readProject, readProjects } from "../../../server/cv/reader.ts";
import { useHead } from "@hushkey/howl-react/head";

type TokenKind = "keyword" | "string" | "comment" | "number" | "builtin" | "plain";
type Token = { text: string; kind: TokenKind };

const KW = new Set([
  "const",
  "let",
  "var",
  "function",
  "async",
  "await",
  "return",
  "import",
  "export",
  "from",
  "type",
  "interface",
  "class",
  "extends",
  "implements",
  "new",
  "this",
  "if",
  "else",
  "for",
  "while",
  "switch",
  "case",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "throw",
  "typeof",
  "instanceof",
  "void",
  "null",
  "undefined",
  "true",
  "false",
  "default",
  "static",
  "public",
  "private",
  "protected",
  "readonly",
  "as",
  "of",
  "in",
  "delete",
  "yield",
  "enum",
  "declare",
  "abstract",
  "override",
  "satisfies",
  "namespace",
]);

const BUILTIN = new Set([
  "string",
  "number",
  "boolean",
  "object",
  "symbol",
  "bigint",
  "never",
  "unknown",
  "any",
  "Array",
  "Promise",
  "Record",
  "Partial",
  "Required",
  "Pick",
  "Omit",
  "console",
  "Deno",
  "Date",
  "Set",
  "Map",
  "Error",
  "URL",
  "Response",
  "Request",
  "Headers",
  "JSON",
  "Math",
  "Object",
  "String",
  "Number",
  "Boolean",
]);

const TOKEN_CLS: Record<TokenKind, string> = {
  keyword: "text-violet-400",
  string: "text-emerald-400",
  comment: "text-zinc-500",
  number: "text-amber-400",
  builtin: "text-cyan-400",
  plain: "text-zinc-200",
};

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      tokens.push({ text: plain, kind: "plain" });
      plain = "";
    }
  };

  while (i < code.length) {
    if (code[i] === "/" && code[i + 1] === "/") {
      flush();
      const end = code.indexOf("\n", i);
      tokens.push({ text: end === -1 ? code.slice(i) : code.slice(i, end), kind: "comment" });
      i = end === -1 ? code.length : end;
      continue;
    }
    if (code[i] === "/" && code[i + 1] === "*") {
      flush();
      const end = code.indexOf("*/", i + 2);
      tokens.push({ text: end === -1 ? code.slice(i) : code.slice(i, end + 2), kind: "comment" });
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (code[i] === "'" || code[i] === '"' || code[i] === "`") {
      flush();
      const q = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== q && (q === "`" || code[j] !== "\n")) {
        if (code[j] === "\\") j++;
        j++;
      }
      tokens.push({ text: code.slice(i, j + 1), kind: "string" });
      i = j + 1;
      continue;
    }
    if (/\d/.test(code[i]) && (i === 0 || /\W/.test(code[i - 1]))) {
      flush();
      let j = i;
      while (j < code.length && /[\d.xXoObBa-fA-F_]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), kind: "number" });
      i = j;
      continue;
    }
    if (/[a-zA-Z_$]/.test(code[i])) {
      flush();
      let j = i;
      while (j < code.length && /[\w$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      tokens.push({
        text: word,
        kind: KW.has(word) ? "keyword" : BUILTIN.has(word) ? "builtin" : "plain",
      });
      i = j;
      continue;
    }
    plain += code[i++];
  }
  flush();
  return tokens;
}

const TS_LANGS = new Set(["ts", "tsx", "js", "jsx", "typescript", "javascript"]);

function CodeBlock(
  { lang, text, filename }: { lang: string; text: string; filename?: string },
) {
  const tokens = TS_LANGS.has(lang) ? tokenize(text) : null;
  return (
    <div className="rounded-xl overflow-hidden border border-zinc-800">
      {filename && (
        <div className="bg-zinc-900 px-4 py-2.5 text-xs font-mono text-zinc-400 border-b border-zinc-800">
          {filename}
        </div>
      )}
      <div className="bg-zinc-950 px-4 sm:px-5 py-4 overflow-x-auto">
        <pre className="font-mono text-[12px] sm:text-[13px] leading-relaxed whitespace-pre">
          {tokens
            ? tokens.map((t, i) => <span key={i} className={TOKEN_CLS[t.kind]}>{t.text}</span>)
            : <span className="text-zinc-200">{text}</span>}
        </pre>
      </div>
      {lang !== "text" && (
        <div className="bg-zinc-900 px-4 py-2 text-right">
          <span className="badge badge-sm badge-ghost font-mono">{lang}</span>
        </div>
      )}
    </div>
  );
}

function Block({ block }: { block: BlockType }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-base sm:text-base text-base-content/80 leading-relaxed my-3">
          {block.text}
        </p>
      );
    case "code":
      return (
        <div className="my-4">
          <CodeBlock lang={block.lang} text={block.text} filename={block.filename} />
        </div>
      );
    case "h3":
      return <h3 className="text-lg font-semibold mt-6 mb-2">{block.text}</h3>;
    case "tip":
      return (
        <div className="alert bg-success/10 border rounded-xl border-success/20 my-4 text-sm px-5 sm:px-4 py-3">
          <span className="text-success font-semibold mr-1">Tip:</span>
          <span className="text-base-content/80">{block.text}</span>
        </div>
      );
    case "warning":
      return (
        <div className="alert bg-warning/10 border rounded-xl border-warning/20 my-4 text-sm px-5 sm:px-4 py-3">
          <span className="text-warning font-semibold mr-1">Warning:</span>
          <span className="text-base-content/80">{block.text}</span>
        </div>
      );
    case "list":
      return (
        <ul className="list-disc list-inside my-3 space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="text-base-content/80 text-sm sm:text-sm leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto my-4 rounded-xl border border-base-300">
          <table className="table table-sm w-full">
            <thead>
              <tr>
                {block.headers.map((h) => (
                  <th key={h} className="bg-base-200 text-xs uppercase tracking-wide py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="hover:bg-base-200/50">
                  {row.map((cell, j) => <td key={j} className="font-mono text-xs py-3">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

export default function ProjectPage(props: ReactPageProps<unknown, State>) {
  const { slug } = props.params;
  const project = readProject(slug);
  if (!project) throw new HttpError(404, "Project not found");

  const all = readProjects();
  const idx = all.findIndex((p) => p.slug === slug);
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  const prev = idx > 0 ? all[idx - 1] : null;

  useHead({
    title: `${project.title} — ${props.state.client?.title ?? "CV"}`,
    meta: [{ name: "description", content: project.tagline }],
  });

  return (
    <>
      <div className="relative flex-1 bg-base-100 bg-dot-grid bg-size-[28px_28px] pt-24 sm:pt-32 pb-16 sm:pb-20">
        <article className="max-w-3xl mx-auto px-5 sm:px-8">
          <a
            href="/projects"
            className="inline-flex items-center gap-1 text-sm text-base-content/50 hover:text-primary mb-8 transition-colors"
          >
            ← All projects
          </a>

          <header className="mb-10 pb-7 border-b border-base-300">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-base-content/40 mb-2">
              {project.year} · {project.role}
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
              {project.title}
            </h1>
            <p className="text-lg text-base-content/70 leading-relaxed mb-5">
              {project.tagline}
            </p>

            <div className="flex flex-wrap gap-1.5 mb-5">
              {project.stack.map((s) => (
                <span
                  key={s}
                  className="badge badge-sm bg-base-200 border-base-300 font-mono text-[11px]"
                >
                  {s}
                </span>
              ))}
            </div>

            {project.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm rounded-lg btn-ghost border border-base-300 hover:border-primary/50 hover:bg-primary/10 font-mono text-xs"
                  >
                    {l.label} ↗
                  </a>
                ))}
              </div>
            )}
          </header>

          {project.sections.length > 2 && (
            <div className="bg-base-300/60 rounded-2xl border border-base-300 p-4 mb-8 shadow-sm">
              <p className="font-semibold text-xs uppercase tracking-widest text-base-content/50 mb-2">
                On this page
              </p>
              <ul className="space-y-0.5">
                {project.sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block py-1.5 text-sm text-base-content/60 hover:text-primary transition-colors"
                    >
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {project.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="mb-10 scroll-mt-24 sm:scroll-mt-8"
            >
              <h2 className="text-xl sm:text-2xl font-semibold mb-4 flex items-center gap-2">
                <a href={`#${section.id}`} className="hover:text-primary transition-colors">
                  {section.heading}
                </a>
              </h2>
              {section.blocks.map((block, i) => <Block key={i} block={block} />)}
            </section>
          ))}

          <div className="flex justify-between gap-4 mt-12 pt-6 border-t border-base-300">
            {prev
              ? (
                <a href={`/projects/${prev.slug}`} className="group flex flex-col max-w-xs py-2">
                  <span className="text-xs text-base-content/40 mb-1">← Previous</span>
                  <span className="text-base font-semibold group-hover:text-primary transition-colors">
                    {prev.title}
                  </span>
                </a>
              )
              : <div />}
            {next && (
              <a
                href={`/projects/${next.slug}`}
                className="group flex flex-col items-end max-w-xs py-2"
              >
                <span className="text-xs text-base-content/40 mb-1">Next →</span>
                <span className="text-base font-semibold group-hover:text-primary transition-colors">
                  {next.title}
                </span>
              </a>
            )}
          </div>
        </article>
      </div>
    </>
  );
}
