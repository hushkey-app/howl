// deno-lint-ignore-file no-explicit-any
/**
 * `<Studio />` — the embeddable admin component for `@hushkey/service-core`
 * services. Compass-style: a connections sidebar, openable/closeable collection
 * tabs that keep their state, document cards with type-colored fields, a query
 * bar with field/operator autocompletion, a storage-schema view, and daisyUI
 * theming. Styled with daisyUI + Tailwind utility classes and heroicons — in
 * standalone mode the middleware loads both from a CDN; in component mode the
 * host app provides daisyUI. Talks to the JSON API mounted by the `studio()`
 * middleware and works identically across every backend.
 *
 * @module
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { type Accent, backendAccent, type ThemeName } from "./theme.ts";
import * as Icon from "./icons.tsx";

/** Style overrides for the studio — daisyUI classes/theme the host can supply. */
export interface StudioStyle {
  /** daisyUI theme name applied via `data-theme` (e.g. `dark`, `light`, any
   * theme the host loads). Overrides the persisted/system default. */
  theme?: ThemeName;
  /** Class(es) for primary actions (FIND, INSERT, APPLY…). Default `btn-primary`. */
  primaryColor?: string;
  /** Class(es) for secondary actions (migrate confirm…). Default `btn-secondary`. */
  secondaryColor?: string;
  /** Extra stylesheet URL(s) — standalone mode only (loaded in the page head). */
  cssUrl?: string | string[];
}

/** Props for {@link Studio}. */
export interface StudioProps {
  /** Base URL of the studio JSON API (default `/studio/api`). */
  endpoint?: string;
  /** Fill the viewport (standalone dashboard) instead of a bordered box. */
  fullscreen?: boolean;
  /** daisyUI style overrides (theme + primary/secondary action classes). */
  style?: StudioStyle;
}

/** Resolved button classes derived from {@link StudioStyle}, threaded to panels. */
interface Ui {
  primary: string;
  secondary: string;
}

interface ServiceMeta {
  key: string;
  collection: string;
  backend: string;
}
interface Doc {
  id: string;
  version?: number;
  meta?: { deleted_at: number | null; [k: string]: unknown };
  [field: string]: unknown;
}
interface SchemaColumn {
  column: string;
  type: string;
  declared: boolean;
}
interface FieldReport {
  missing: { field: string; default: unknown }[];
  orphans: string[];
  sampled: number;
  invalid: number;
}

const OPERATORS = [
  "$eq",
  "$ne",
  "$in",
  "$nin",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$or",
  "$and",
  "$exists",
];

// Brand separator for the wordmark — a bound identifier, not a JSX literal, so
// it dodges both the curly-literal and comment-text-node lint rules on "//".
const WORDMARK_SEP = "//";

// Compass accepts relaxed queries; so do we — quote bare keys/operators and
// convert single-quoted strings, then strict-parse.
function looseJsonParse(text: string): unknown {
  const normalized = text
    .replace(/([{,[]\s*)([$A-Za-z_][\w$.]*)\s*:/g, '$1"$2":')
    .replace(/'([^']*)'/g, (_m, s) => JSON.stringify(s));
  return JSON.parse(normalized);
}

// Dot-paths of every field seen in the loaded documents — the autocomplete
// vocabulary (we know the operators exactly; fields come from sampling).
function fieldPaths(docs: Doc[]): string[] {
  const out = new Set<string>(["id", "version", "meta.deleted_at"]);
  const walk = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    if (depth > 3) return;
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      out.add(path);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, path, depth + 1);
      }
    }
  };
  for (const d of docs.slice(0, 20)) walk(d, "", 0);
  return [...out].sort();
}

// Type-colored values, Compass-style, via daisyUI semantic color classes.
function valueClass(v: unknown): string {
  if (v === null || v === undefined) return "text-base-content/50";
  switch (typeof v) {
    case "string":
      return "text-success";
    case "number":
      return "text-info";
    case "boolean":
      return "text-secondary";
    default:
      return "text-base-content";
  }
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

// Inline-edit (Compass-style) value↔text bridge. A field's value becomes the
// raw text shown in its input — strings unquoted, objects/arrays as JSON — and
// `fromEditText` parses it back keeping the original type (no type changes in
// the inline editor; switch types via the JSON editor instead).
function toEditText(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

function fromEditText(text: string, original: unknown): unknown {
  if (typeof original === "string") return text;
  if (typeof original === "boolean") return text.trim() === "true";
  if (typeof original === "number") {
    const n = Number(text.trim());
    if (text.trim() === "" || Number.isNaN(n)) throw new Error(`"${text}" is not a number`);
    return n;
  }
  // null / object / array: empty clears to null, otherwise parse as JSON.
  return text.trim() === "" ? null : looseJsonParse(text);
}

// ─────────────────────────────────────────────────────────────── query bar ──

/** Live lint result for the query bar. */
interface LintStatus {
  level: "empty" | "ok" | "pending" | "error";
  message: string;
}

const ARRAY_OPERATORS = ["$in", "$nin", "$or", "$and"];

function findFilterIssue(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = findFilterIssue(x);
      if (r) return r;
    }
    return null;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("$") && !OPERATORS.includes(k)) {
        return `unknown operator ${k} — grammar: ${OPERATORS.join(" ")}`;
      }
      if (ARRAY_OPERATORS.includes(k) && !Array.isArray(v)) {
        return `${k} expects an array — ${k}: [ … ]`;
      }
      if ((k === "$or" || k === "$and") && Array.isArray(v)) {
        if (v.some((x) => x === null || typeof x !== "object" || Array.isArray(x))) {
          return `${k} expects an array of conditions — ${k}: [{ … }, { … }]`;
        }
      }
      const r = findFilterIssue(v);
      if (r) return r;
    }
  }
  return null;
}

// The "compiler" half of the bar: parse on every keystroke, then check every
// $key against the grammar — the same check the backend compiler enforces.
function lintFilter(text: string): LintStatus {
  if (!text.trim()) return { level: "empty", message: "" };
  try {
    const parsed = looseJsonParse(text);
    const issue = findFilterIssue(parsed);
    if (issue) return { level: "error", message: issue };
    return { level: "ok", message: "✓ valid filter" };
  } catch (e) {
    const opens = (text.match(/[{[]/g) ?? []).length;
    const closes = (text.match(/[}\]]/g) ?? []).length;
    if (opens > closes) return { level: "pending", message: "… unclosed braces" };
    return { level: "error", message: `✗ ${(e as Error).message}` };
  }
}

const PAIRS: Record<string, string> = { "{": "}", "[": "]", "(": ")", '"': '"', "'": "'" };
const CLOSERS = new Set(Object.values(PAIRS));

// Editor-style bracket behavior for plain inputs/textareas: typing a pair key
// over a selection wraps it, an empty caret auto-closes the pair, and typing
// a closing character that is already next steps over it instead of doubling.
function handlePairKey(
  e: { key: string; preventDefault(): void },
  el: { value: string; selectionStart: number | null; selectionEnd: number | null },
  apply: (next: string, selStart: number, selEnd: number) => void,
): boolean {
  const key = e.key;
  const v = el.value;
  const start = el.selectionStart ?? v.length;
  const end = el.selectionEnd ?? start;

  if (key in PAIRS) {
    const close = PAIRS[key];
    if (start !== end) {
      // wrap the highlighted text, keep it selected
      const next = v.slice(0, start) + key + v.slice(start, end) + close + v.slice(end);
      e.preventDefault();
      apply(next, start + 1, end + 1);
      return true;
    }
    if ((key === '"' || key === "'") && v[start] === key) {
      e.preventDefault();
      apply(v, start + 1, start + 1);
      return true;
    }
    const next = v.slice(0, start) + key + close + v.slice(end);
    e.preventDefault();
    apply(next, start + 1, start + 1);
    return true;
  }
  if (CLOSERS.has(key) && start === end && v[start] === key) {
    e.preventDefault();
    apply(v, start + 1, start + 1);
    return true;
  }
  return false;
}

function QueryBar(
  { fields, value, onChange, onFind, lint }: {
    fields: string[];
    value: string;
    onChange: (v: string) => void;
    onFind: () => void;
    lint: LintStatus;
  },
): ReactElement {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const [token, setToken] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function refresh(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = before.match(/[$"\w.]*$/);
    const raw = m?.[0] ?? "";
    const tok = raw.replace(/^"/, "");
    let hits: string[];
    if (tok.length > 0) {
      const pool = tok.startsWith("$") ? OPERATORS : [...fields, ...OPERATORS];
      hits = pool.filter((x) => x.startsWith(tok) && x !== tok);
    } else if (before.trim() === "" || /[{,[]\s*"?$/.test(before)) {
      // key position with nothing typed — show the field vocabulary so you
      // can discover what is in the collection
      hits = fields;
    } else {
      setOpen(false);
      return;
    }
    setToken(tok);
    setItems(hits.slice(0, 8));
    setSel(0);
    setOpen(hits.length > 0);
  }

  function accept(item: string) {
    const el = inputRef.current;
    if (!el) return;
    setOpen(false);
    // Empty bar: scaffold the braces around the picked field, caret at the
    // value position — `{ email: ▏ }`.
    if (value.trim() === "") {
      const next = `{ ${item}:  }`;
      onChange(next);
      const pos = next.length - 2;
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
      return;
    }
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    let replaced = before.replace(/[$\w.]*$/, item);
    let pos: number;
    if (!after.trimStart().startsWith(":")) {
      if (ARRAY_OPERATORS.includes(item)) {
        // Array-taking operators scaffold their brackets; the inner shape
        // ({ … } conditions for $or/$and) is the developer's call — the lint
        // chip on the right says what is missing.
        replaced += ": []";
        pos = replaced.length - 1;
      } else {
        replaced += ": ";
        pos = replaced.length;
      }
    } else {
      pos = replaced.length;
    }
    onChange(replaced + after);
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  const stateClass: Record<LintStatus["level"], string> = {
    empty: "",
    ok: "input-success",
    pending: "input-warning",
    error: "input-error",
  };
  const chipClass: Record<LintStatus["level"], string> = {
    empty: "text-base-content/60",
    ok: "text-success",
    pending: "text-warning",
    error: "text-error",
  };

  return (
    <div className="relative flex-1 min-w-64">
      <input
        ref={inputRef}
        value={value}
        placeholder="{ field: 'value' } — focus for fields, $ for operators"
        className={`input input-bordered w-full font-mono text-sm ${stateClass[lint.level]}`}
        onFocus={(e) => {
          const el = e.target as HTMLInputElement;
          refresh(el.value, el.selectionStart ?? el.value.length);
        }}
        onChange={(e) => {
          const el = e.target as HTMLInputElement;
          onChange(el.value);
          refresh(el.value, el.selectionStart ?? el.value.length);
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => (s + 1) % items.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => (s - 1 + items.length) % items.length);
              return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
              e.preventDefault();
              accept(items[sel]);
              return;
            }
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
          }
          const el = inputRef.current;
          if (
            el && handlePairKey(e, el, (next, s, en) => {
              onChange(next);
              queueMicrotask(() => {
                el.focus();
                el.setSelectionRange(s, en);
                refresh(next, s);
              });
            })
          ) {
            return;
          }
          if (e.key === "Enter" && lint.level !== "error") onFind();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {!open && lint.level !== "empty" && (
        <div
          className={`absolute top-full right-1 mt-0.5 z-20 max-w-full truncate rounded bg-base-100 px-1.5 font-mono text-[10px] ${
            chipClass[lint.level]
          }`}
        >
          {lint.message}
        </div>
      )}
      {open && (
        <ul className="menu menu-sm absolute top-full left-0 z-30 mt-1 min-w-56 rounded-box border border-base-300 bg-base-100 p-1 font-mono text-xs shadow-lg">
          {items.map((item, i) => (
            <li key={item}>
              <a
                className={`flex justify-between gap-4 ${i === sel ? "active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(item);
                }}
              >
                <span className={item.startsWith("$") ? "text-secondary" : ""}>
                  <b className="text-primary">{token}</b>
                  {item.slice(token.length)}
                </span>
                <span className="text-[10px] text-base-content/60">
                  {item.startsWith("$") ? "operator" : "field"}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── doc cards ──

// A nested value rendered as an expandable, type-colored tree — the same field
// styling as the top-level document (bold keys, type-colored values, chevrons),
// recursing through objects and arrays so an expanded sub-document reads like
// the document itself rather than a flat JSON string blob.
function JsonNode(
  { name, value, isIndex, depth }: {
    name: string;
    value: unknown;
    isIndex: boolean;
    depth: number;
  },
): ReactElement {
  const isObj = value !== null && typeof value === "object";
  // First level opens by default so a field's shape is visible at a glance;
  // deeper branches start collapsed to keep large documents readable.
  const [open, setOpen] = useState(depth < 1);
  return (
    <div>
      <span
        className={isObj ? "cursor-pointer" : ""}
        onClick={isObj ? () => setOpen((o) => !o) : undefined}
      >
        <span className="mr-1 inline-block w-3 text-center align-middle">
          {isObj && (
            <Icon.ChevronDown
              className={`inline size-3 text-base-content/60 ${open ? "" : "-rotate-90"}`}
            />
          )}
        </span>
        <span className={`font-bold ${isIndex ? "text-base-content/40" : "text-base-content"}`}>
          {name}
        </span>
        <span className="mx-1 text-base-content/60">:</span>
        {isObj
          ? (
            <span className="text-base-content/60">
              {Array.isArray(value) ? `Array (${value.length})` : "Object"}
            </span>
          )
          : <span className={valueClass(value)}>{fmtValue(value)}</span>}
      </span>
      {isObj && open && <JsonChildren value={value as object} depth={depth + 1} />}
    </div>
  );
}

// Renders the entries of an object/array one level down — indented — recursing
// through {@link JsonNode}. Array entries key on their index.
function JsonChildren(
  { value, depth }: { value: object; depth: number },
): ReactElement {
  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  if (entries.length === 0) {
    return (
      <div className="ml-3 text-base-content/40">
        {Array.isArray(value) ? "empty array" : "empty object"}
      </div>
    );
  }
  return (
    <div className="ml-3">
      {entries.map(([k, v]) => (
        <JsonNode key={k} name={k} value={v} isIndex={Array.isArray(value)} depth={depth} />
      ))}
    </div>
  );
}

interface ExpandSignal {
  mode: "expand" | "collapse";
  tick: number;
}

// The in-place editor for one field's value, picked by the value's type:
// boolean → a true/false select, object/array → a JSON textarea, everything
// else → a single-line input. Edits flow back through `onText` as raw text;
// the card parses it on save via {@link fromEditText}.
function EditControl(
  { value, text, onText }: {
    value: unknown;
    text: string;
    onText: (t: string) => void;
  },
): ReactElement {
  if (typeof value === "boolean") {
    return (
      <select
        className="select select-xs select-bordered ml-1 font-mono text-sm"
        value={text}
        onChange={(e) => onText((e.target as HTMLSelectElement).value)}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (value !== null && typeof value === "object") {
    return (
      <textarea
        className="textarea textarea-bordered mt-1 block w-full font-mono text-sm leading-5"
        rows={Math.min(12, text.split("\n").length + 1)}
        value={text}
        onChange={(e) => onText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          const el = e.target as HTMLTextAreaElement;
          handlePairKey(e, el, (next, s, en) => {
            onText(next);
            queueMicrotask(() => {
              el.focus();
              el.setSelectionRange(s, en);
            });
          });
        }}
      />
    );
  }
  return (
    <input
      className="input input-xs input-bordered ml-1 w-72 max-w-full font-mono text-sm"
      value={text}
      placeholder={value === null ? "null" : ""}
      inputMode={typeof value === "number" ? "decimal" : undefined}
      onChange={(e) => onText((e.target as HTMLInputElement).value)}
    />
  );
}

function DocCard(
  { doc, onPatch, onDuplicate, onDelete, onRestore, expandSignal, ui }: {
    doc: Doc;
    onPatch: (patch: Record<string, unknown>) => Promise<void>;
    onDuplicate: () => void;
    onDelete: (hard: boolean) => void;
    onRestore: () => void;
    expandSignal: ExpandSignal | null;
    ui: Ui;
  },
): ReactElement {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState<Record<string, string>>({});
  const [editErr, setEditErr] = useState("");
  const [saving, setSaving] = useState(false);
  // Single-doc delete confirmation; `hard` carries the soft/permanent choice.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hardDelete, setHardDelete] = useState(false);
  const deleted = doc.meta?.deleted_at != null;
  const entries = Object.entries(doc).filter(([k]) => k !== "id");
  const anyExpanded = Object.values(expanded).some(Boolean);
  // System fields are owned by the contract (version bumps on write, meta is
  // audit/soft-delete) — shown read-only, never editable inline.
  const editable = (k: string) => k !== "version" && k !== "meta";

  function startEdit() {
    const b: Record<string, string> = {};
    for (const [k, v] of entries) if (editable(k)) b[k] = toEditText(v);
    setBuffer(b);
    setEditErr("");
    setExpanded({});
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditErr("");
  }

  async function saveEdit() {
    setEditErr("");
    let patch: Record<string, unknown>;
    try {
      patch = {};
      for (const [k, v] of entries) {
        if (!editable(k)) continue;
        const next = fromEditText(buffer[k] ?? "", v);
        if (JSON.stringify(next) !== JSON.stringify(v)) patch[k] = next;
      }
    } catch (e) {
      setEditErr((e as Error).message);
      return;
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onPatch(patch);
      setEditing(false);
    } catch (e) {
      setEditErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function toggleAll() {
    if (anyExpanded) {
      setExpanded({});
      return;
    }
    const all: Record<string, boolean> = {};
    for (const [k, v] of entries) {
      if (v !== null && typeof v === "object") all[k] = true;
    }
    setExpanded(all);
  }

  useEffect(() => {
    if (!expandSignal) return;
    if (expandSignal.mode === "expand") {
      const all: Record<string, boolean> = {};
      for (const [k, v] of entries) {
        if (v !== null && typeof v === "object") all[k] = true;
      }
      setExpanded(all);
    } else {
      setExpanded({});
    }
  }, [expandSignal?.tick]);

  return (
    <div
      className={`group relative mb-3 rounded-2xl bg-base-200 py-3 pl-9 pr-4 font-mono text-sm transition-colors ${
        editing ? "ring-1 ring-primary/40" : "hover:bg-base-300/50"
      } ${deleted ? "opacity-55" : ""}`}
    >
      {!editing && (
        <button
          type="button"
          title={anyExpanded ? "collapse all fields" : "expand all fields"}
          onClick={toggleAll}
          className={`btn btn-ghost btn-sm btn-circle absolute left-1.5 top-1.5 transition-opacity ${
            anyExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <Icon.ChevronDown className={`size-4 ${anyExpanded ? "" : "-rotate-90"}`} />
        </button>
      )}
      <div
        className={`absolute right-2.5 top-1.5 flex items-center gap-1 transition-opacity ${
          editing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {deleted && <span className="badge badge-error badge-xs">DELETED</span>}
        <button
          type="button"
          className={`btn btn-ghost btn-sm btn-circle ${editing ? "text-primary" : ""}`}
          title={editing ? "cancel edit" : "edit fields inline"}
          onClick={() => (editing ? cancelEdit() : startEdit())}
        >
          <Icon.Pencil className="size-4" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-circle"
          title="duplicate (insert a copy — adjust unique fields first)"
          onClick={onDuplicate}
        >
          <Icon.Duplicate className="size-4" />
        </button>
        {deleted
          ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                title="restore"
                onClick={onRestore}
              >
                <Icon.Restore className="size-4" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle text-error"
                title="hard delete"
                onClick={() => {
                  setHardDelete(true);
                  setConfirmDelete(true);
                }}
              >
                <Icon.Trash className="size-4" />
              </button>
            </>
          )
          : (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle text-error"
              title="delete"
              onClick={() => {
                setHardDelete(false);
                setConfirmDelete(true);
              }}
            >
              <Icon.XMark className="size-4" />
            </button>
          )}
      </div>

      <div className="leading-7">
        <div>
          <span className="mr-1 inline-block w-3 align-middle" />
          <span className="font-bold text-base-content">id</span>
          <span className="mx-1 text-base-content/60">:</span>
          <span className="text-error">"{doc.id}"</span>
        </div>
        {entries.map(([k, v]) => {
          const isObj = v !== null && typeof v === "object";
          const canEdit = editing && editable(k);
          const expandable = !canEdit && isObj;
          return (
            <div key={k}>
              <span
                className={expandable ? "cursor-pointer" : ""}
                onClick={expandable ? () => setExpanded((s) => ({ ...s, [k]: !s[k] })) : undefined}
              >
                <span className="mr-1 inline-block w-3 text-center align-middle">
                  {expandable && (
                    <Icon.ChevronDown
                      className={`inline size-3 text-base-content/60 ${
                        expanded[k] ? "" : "-rotate-90"
                      }`}
                    />
                  )}
                </span>
                <span
                  className={`font-bold ${canEdit ? "text-base-content/50" : "text-base-content"}`}
                >
                  {k}
                </span>
                <span className="mx-1 text-base-content/60">:</span>
                {canEdit
                  ? (
                    <EditControl
                      value={v}
                      text={buffer[k] ?? ""}
                      onText={(t) => setBuffer((s) => ({ ...s, [k]: t }))}
                    />
                  )
                  : isObj
                  ? (
                    <span className="text-base-content/60">
                      {Array.isArray(v) ? `Array (${v.length})` : "Object"}
                    </span>
                  )
                  : <span className={valueClass(v)}>{fmtValue(v)}</span>}
              </span>
              {expandable && expanded[k] && (
                <div className="my-1 ml-4 overflow-x-auto rounded-xl bg-base-300/50 px-2.5 py-1.5 text-sm">
                  <JsonChildren value={v as object} depth={0} />
                </div>
              )}
            </div>
          );
        })}
        {editing && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`btn btn-sm rounded-full ${ui.primary}`}
              disabled={saving}
              onClick={saveEdit}
            >
              {saving ? <span className="loading loading-spinner loading-xs" /> : "SAVE"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost rounded-full"
              disabled={saving}
              onClick={cancelEdit}
            >
              CANCEL
            </button>
            {editErr
              ? <span className="text-xs text-error">✗ {editErr}</span>
              : (
                <span className="ml-auto text-[11px] text-base-content/50">
                  merge patch — only changed fields, version bumps
                </span>
              )}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md border border-error font-mono text-xs">
            <h3 className="mb-2 text-base font-bold text-error">
              {hardDelete ? "Permanently delete document?" : "Delete document?"}
            </h3>
            <p className="mb-4 leading-relaxed text-base-content/70">
              {hardDelete ? "Permanently removes" : "Soft-deletes"}{" "}
              <b className="text-base-content">{doc.id}</b> {hardDelete
                ? "— its data is gone for good and cannot be restored."
                : "— it's hidden but restorable from the “deleted” view."}
            </p>
            <label className="mb-4 flex items-center gap-2 text-base-content/60">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={hardDelete}
                disabled={deleted}
                onChange={(e) => setHardDelete((e.target as HTMLInputElement).checked)}
              />
              hard delete (cannot be undone)
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost rounded-full"
                onClick={() => setConfirmDelete(false)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="btn btn-error rounded-full"
                onClick={() => {
                  const hard = hardDelete;
                  setConfirmDelete(false);
                  onDelete(hard);
                }}
              >
                {hardDelete ? "DELETE PERMANENTLY" : "DELETE"}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setConfirmDelete(false)} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── collection tab ──

// Client mirror of the service patch semantics for the bulk-update preview:
// objects merge, arrays replace, null clears.
function mergePreview(target: any, patch: any): any {
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (
      v !== null && typeof v === "object" && !Array.isArray(v) &&
      out[k] !== null && typeof out[k] === "object" && !Array.isArray(out[k])
    ) {
      out[k] = mergePreview(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

type ViewMode = "cards" | "raw" | "table" | "schema";
type PanelMode = null | "update" | "delete";

// ───────────────────────────────────────────────────── document fields ──

// The schema ⇄ documents diff: declared fields MISSING from stored docs (with
// the schema default, one-click backfilled through the contract) and ORPHAN
// JSON fields present in docs but no longer declared (one-click dropped). The
// zero-migration evolution console — works on every backend, document stores
// included (unlike promoted columns below).
function FieldsPanel(
  { report, onBackfill, onDrop, ui }: {
    report: FieldReport | null;
    onBackfill: (field: string) => void;
    onDrop: (field: string) => void;
    ui: Ui;
  },
): ReactElement {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  if (report === null) {
    return (
      <div className="mb-4 flex items-center gap-2 p-4 text-sm text-base-content/60">
        <span className="loading loading-spinner loading-xs" /> diffing schema against documents…
      </div>
    );
  }
  const inSync = report.missing.length === 0 && report.orphans.length === 0;
  return (
    <div className="mb-4 text-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/50">
        Document fields — schema vs stored
      </div>
      {inSync
        ? (
          <div className="rounded-2xl bg-base-200 p-4 text-base-content/60">
            ✓ every declared field is present and no orphan fields remain — schema and documents are
            in sync
          </div>
        )
        : (
          <div className="overflow-x-auto rounded-2xl bg-base-200">
            <table className="table">
              <thead>
                <tr>
                  <th>field</th>
                  <th>state</th>
                  <th>detail</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.missing.map((m) => (
                  <tr key={`m-${m.field}`} className="bg-info/10">
                    <td className="font-mono font-bold text-base-content">{m.field}</td>
                    <td>
                      <span className="badge badge-info badge-sm">MISSING</span>
                    </td>
                    <td className="font-mono text-xs text-base-content/60">
                      default {JSON.stringify(m.default)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className={`btn btn-sm rounded-full ${ui.primary}`}
                        title={`set ${m.field} = ${JSON.stringify(m.default)} on docs missing it`}
                        onClick={() => onBackfill(m.field)}
                      >
                        BACKFILL
                      </button>
                    </td>
                  </tr>
                ))}
                {report.orphans.map((f) => (
                  <tr key={`o-${f}`} className="bg-warning/10">
                    <td className="font-mono font-bold text-base-content">{f}</td>
                    <td>
                      <span className="badge badge-warning badge-sm">ORPHAN</span>
                    </td>
                    <td className="font-mono text-xs text-base-content/60">
                      in documents, not in schema
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline btn-warning rounded-full"
                        title={`remove "${f}" from every document`}
                        onClick={() => setDropTarget(f)}
                      >
                        DROP
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <div className="mt-1.5 text-[11px] text-base-content/50">
        sampled {report.sampled} document{report.sampled === 1 ? "" : "s"}
        {report.invalid > 0 ? ` · ${report.invalid} failed validation (skipped)` : ""}. MISSING
        backfills the schema default through the contract; DROP removes an orphan key from every
        document.
      </div>

      {dropTarget !== null && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md border border-warning font-mono text-xs">
            <h3 className="mb-2 text-base font-bold text-warning">Drop orphan field?</h3>
            <p className="mb-4 leading-relaxed text-base-content/70">
              Removes <b className="text-base-content">{dropTarget}</b>{" "}
              from every document in this collection. This deletes the stored data for that key and
              cannot be undone — re-add it to the schema and backfill if you need it again.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost rounded-full"
                onClick={() => setDropTarget(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className="btn btn-warning rounded-full"
                onClick={() => {
                  const f = dropTarget;
                  setDropTarget(null);
                  onDrop(f);
                }}
              >
                DROP FIELD
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDropTarget(null)} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────── schema panel ──

// The storage-schema view: promoted columns physically present in the backend,
// each flagged declared (in the live config) or an orphan — a column left
// behind when a `promote` entry was removed, still index-maintained on every
// write for no read benefit. Orphans get a warning row, a → that migrates the
// data into a declared field, and an ✕ that drops the column — both via yes/no
// dialogs. Document data is never lost (it lives in the JSON doc).
function SchemaPanel(
  { supported, columns, onDrop, onMigrate, ui }: {
    supported: boolean | null;
    columns: SchemaColumn[];
    onDrop: (column: string) => void;
    onMigrate: (from: string, to: string) => void;
    ui: Ui;
  },
): ReactElement {
  const [target, setTarget] = useState<string | null>(null);
  const [migrateFrom, setMigrateFrom] = useState<string | null>(null);
  const [migrateTo, setMigrateTo] = useState("");
  const orphans = columns.filter((c) => !c.declared).length;
  // Migrate targets: declared columns the data can land in — never the system
  // columns, never the orphan being migrated away.
  const targets = columns.filter(
    (c) => c.declared && c.column !== "version" && c.column !== "deleted_at",
  );

  if (supported === false) {
    return (
      <div className="p-8 text-sm text-base-content/60">
        this backend has no promoted columns to manage (no column concept)
      </div>
    );
  }
  if (supported === null) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-base-content/60">
        <span className="loading loading-spinner loading-xs" /> loading schema…
      </div>
    );
  }

  return (
    <div className="text-sm">
      <div className="mb-3 text-xs text-base-content/60">
        promoted columns generated from the document JSON. {orphans > 0
          ? (
            <span className="text-warning">
              {orphans} orphan{orphans === 1 ? "" : "s"}{" "}
              — present in storage but not in the live config. Migrate (→) renames into a declared
              field; drop (✕) reclaims the index.
            </span>
          )
          : "all columns match the live config — nothing to clean up."}
      </div>
      <div className="overflow-x-auto rounded-2xl bg-base-200">
        <table className="table">
          <thead>
            <tr>
              <th>column</th>
              <th>type</th>
              <th>status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.column} className={c.declared ? "" : "bg-warning/10"}>
                <td className="font-mono font-bold text-base-content">{c.column}</td>
                <td className="font-mono text-base-content/60">{c.type}</td>
                <td>
                  {c.declared
                    ? <span className="badge badge-success badge-sm">in config</span>
                    : <span className="badge badge-warning badge-sm">ORPHAN</span>}
                </td>
                <td className="text-right whitespace-nowrap">
                  {!c.declared && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-circle btn-outline btn-success mr-1.5"
                        title={`migrate "${c.column}" into another field, then drop it`}
                        disabled={targets.length === 0}
                        onClick={() => {
                          setMigrateTo(targets.find((t) => t.column !== c.column)?.column ?? "");
                          setMigrateFrom(c.column);
                        }}
                      >
                        <Icon.ArrowRight className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-circle btn-outline btn-warning"
                        title={`drop orphan column "${c.column}"`}
                        onClick={() =>
                          setTarget(c.column)}
                      >
                        <Icon.XMark className="size-4" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {columns.length === 0 && (
              <tr>
                <td colSpan={4} className="text-base-content/60">no promoted columns</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* yes/no drop dialog */}
      {target !== null && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md border border-warning font-mono text-xs">
            <h3 className="mb-2 text-base font-bold text-warning">Drop orphan column?</h3>
            <p className="mb-4 leading-relaxed text-base-content/70">
              Drops the generated column <b className="text-base-content">{target}</b>{" "}
              and its index. The document data stays in the JSON — only the unused index is
              reclaimed. To recreate it, add the path back to <code>promote</code> in code.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost rounded-full"
                onClick={() => setTarget(null)}
              >
                NO
              </button>
              <button
                type="button"
                className="btn btn-warning rounded-full"
                onClick={() => {
                  const col = target;
                  setTarget(null);
                  onDrop(col);
                }}
              >
                YES, DROP
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setTarget(null)} />
        </div>
      )}

      {/* rename / migrate dialog */}
      {migrateFrom !== null && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg border border-primary font-mono text-xs">
            <h3 className="mb-2 text-base font-bold text-primary">Migrate orphan into a field</h3>
            <p className="mb-4 leading-relaxed text-base-content/70">
              Copies <b className="text-base-content">{migrateFrom}</b>{" "}
              into the field below for every document — through the contract, so each write
              validates, bumps <code>version</code>, and stamps audit. Then{" "}
              <b className="text-warning">drops {migrateFrom}</b>{" "}
              (its column and its JSON key). Top-level fields only.
            </p>
            <label className="mb-4 flex items-center gap-2 text-base-content/60">
              <span>{migrateFrom} →</span>
              <select
                className="select select-bordered flex-1 font-mono text-sm"
                value={migrateTo}
                onChange={(e) => setMigrateTo((e.target as HTMLSelectElement).value)}
              >
                {targets
                  .filter((t) => t.column !== migrateFrom)
                  .map((t) => <option key={t.column} value={t.column}>{t.column}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost rounded-full"
                onClick={() => setMigrateFrom(null)}
              >
                CANCEL
              </button>
              <button
                type="button"
                className={`btn rounded-full ${ui.secondary}`}
                disabled={!migrateTo}
                onClick={() => {
                  const from = migrateFrom;
                  const to = migrateTo;
                  setMigrateFrom(null);
                  onMigrate(from, to);
                }}
              >
                MIGRATE &amp; DROP
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setMigrateFrom(null)} />
        </div>
      )}
    </div>
  );
}

function CollectionTab(
  { svc, endpoint, visible, ui }: {
    svc: ServiceMeta;
    endpoint: string;
    visible: boolean;
    ui: Ui;
  },
): ReactElement {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [applied, setApplied] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [skip, setSkip] = useState(0);
  const [limit, setLimit] = useState(20);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Doc | null | "new">(null);
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [panel, setPanel] = useState<PanelMode>(null);
  const [patchDraft, setPatchDraft] = useState("{\n  \n}");
  const [hardBulk, setHardBulk] = useState(false);
  const [backfillMissing, setBackfillMissing] = useState(false);
  const [backfillInfo, setBackfillInfo] = useState<{ sample: Doc[]; total: number } | null>(null);
  const [expandSignal, setExpandSignal] = useState<ExpandSignal | null>(null);
  const [schemaCols, setSchemaCols] = useState<SchemaColumn[]>([]);
  const [schemaSupported, setSchemaSupported] = useState<boolean | null>(null);
  const [fieldReport, setFieldReport] = useState<FieldReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${endpoint}${path}`, init);
    const body = await res.json();
    if (!res.ok || body.message) throw new Error(body.message ?? `HTTP ${res.status}`);
    return body as T;
  }
  const post = (path: string, body: unknown) =>
    call(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  function appliedFilter(): unknown {
    return applied.trim() ? looseJsonParse(applied) : {};
  }

  async function load(
    filterText = applied,
    atSkip = skip,
    deleted = showDeleted,
    atLimit = limit,
  ) {
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(atLimit), skip: String(atSkip) });
      if (filterText.trim()) {
        params.set("filter", JSON.stringify(looseJsonParse(filterText)));
      }
      if (deleted) params.set("deleted", "true");
      const res = await call<{ data: Doc[]; total?: number }>(`/services/${svc.key}?${params}`);
      setDocs(res.data);
      setTotal(res.total ?? res.data.length);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const fields = useMemo(() => fieldPaths(docs), [docs]);
  const lint = useMemo(() => lintFilter(filter), [filter]);
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const d of docs.slice(0, 20)) {
      for (const k of Object.keys(d)) {
        if (k !== "id" && k !== "version" && k !== "meta") keys.add(k);
      }
    }
    return [...keys].slice(0, 6);
  }, [docs]);

  function find() {
    setApplied(filter);
    setSkip(0);
    load(filter, 0);
  }
  function reset() {
    setFilter("");
    setApplied("");
    setSkip(0);
    load("", 0);
  }

  function openEditor(doc: Doc | "new") {
    setError("");
    setPanel(null);
    if (doc === "new") setDraft("{\n  \n}");
    else {
      const { id: _i, version: _v, meta: _m, ...rest } = doc;
      setDraft(JSON.stringify(rest, null, 2));
    }
    setEditing(doc);
  }

  // Compass-style clone: open the INSERT editor pre-filled with the doc's
  // fields — new id / version 1 / fresh meta on save; unique fields can be
  // adjusted before inserting.
  function duplicateDoc(doc: Doc) {
    setError("");
    setPanel(null);
    const { id: _i, version: _v, meta: _m, ...rest } = doc;
    setDraft(JSON.stringify(rest, null, 2));
    setEditing("new");
  }

  async function save() {
    if (editing === null) return;
    setError("");
    try {
      const body = looseJsonParse(draft);
      if (editing === "new") {
        const res = await post(`/services/${svc.key}`, body) as { count?: number };
        setNotice(
          Array.isArray(body) ? `inserted ${res.count} documents` : "document inserted",
        );
      } else {
        await post(`/services/${svc.key}/${editing.id}`, body);
        setNotice(`patched ${editing.id.slice(0, 8)}…`);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function act(path: string, init?: RequestInit) {
    setError("");
    try {
      await call(path, init);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function importFile(file: File) {
    setError("");
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // NDJSON fallback: one document per line
        parsed = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
      }
      const body = Array.isArray(parsed) ? parsed : [parsed];
      const res = await post(`/services/${svc.key}`, body) as { count?: number };
      setNotice(`imported ${res.count ?? 1} documents from ${file.name}`);
      await load();
    } catch (e) {
      setError(`import failed: ${(e as Error).message}`);
    }
  }

  // Backfill scopes the patch to documents missing each patched key
  // ($exists: false), AND-ed with the current query, so adding a new config
  // field to the whole collection never overwrites docs that already carry a
  // value. Shared by the apply action and the live preview.
  function backfillFilterFor(patch: Record<string, unknown>): unknown {
    const conds: unknown[] = [];
    const base = appliedFilter();
    if (base && typeof base === "object" && Object.keys(base).length > 0) conds.push(base);
    for (const k of Object.keys(patch)) conds.push({ [k]: { $exists: false } });
    if (conds.length === 0) return {};
    return conds.length === 1 ? conds[0] : { $and: conds };
  }

  async function bulkUpdate() {
    setError("");
    try {
      const patch = looseJsonParse(patchDraft);
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new Error("patch must be an object, e.g. { field: value }");
      }
      const filter = backfillMissing
        ? backfillFilterFor(patch as Record<string, unknown>)
        : appliedFilter();
      const res = await post(`/services/${svc.key}/bulk-update`, {
        filter,
        patch,
      }) as { count: number };
      setNotice(`${backfillMissing ? "backfilled" : "updated"} ${res.count} documents`);
      setPanel(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function bulkDelete() {
    setError("");
    try {
      const res = await post(`/services/${svc.key}/bulk-delete`, {
        filter: appliedFilter(),
        hard: hardBulk,
      }) as { count: number };
      setNotice(`${hardBulk ? "hard-" : "soft-"}deleted ${res.count} documents`);
      setPanel(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function exportJson() {
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(Math.max(total, 1)), skip: "0" });
      if (applied.trim()) params.set("filter", JSON.stringify(looseJsonParse(applied)));
      if (showDeleted) params.set("deleted", "true");
      const res = await call<{ data: Doc[] }>(`/services/${svc.key}?${params}`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${svc.collection}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setNotice(`exported ${res.data.length} documents`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadSchema() {
    setError("");
    try {
      const res = await call<{ supported: boolean; columns: SchemaColumn[] }>(
        `/services/${svc.key}/schema`,
      );
      setSchemaSupported(res.supported);
      setSchemaCols(res.columns);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function dropSchemaColumn(column: string) {
    setError("");
    try {
      await post(`/services/${svc.key}/schema`, { column });
      setNotice(`dropped orphan column ${column}`);
      await loadSchema();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function migrateSchemaColumn(from: string, to: string) {
    setError("");
    try {
      const res = await post(`/services/${svc.key}/schema`, { from, to }) as { migrated: number };
      setNotice(`migrated ${res.migrated} docs ${from} → ${to}, then dropped ${from}`);
      await loadSchema();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadFieldReport() {
    setFieldReport(null);
    try {
      setFieldReport(await call<FieldReport>(`/services/${svc.key}/fields`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function backfillField(field: string) {
    setError("");
    try {
      const res = await post(`/services/${svc.key}/fields`, { backfill: field }) as {
        backfilled: number;
      };
      setNotice(`backfilled "${field}" on ${res.backfilled} documents`);
      await load();
      await loadFieldReport();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function dropOrphanField(field: string) {
    setError("");
    try {
      const res = await post(`/services/${svc.key}/fields`, { drop: field }) as { count: number };
      setNotice(`dropped "${field}" from ${res.count} documents`);
      await load();
      await loadFieldReport();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function switchView(m: ViewMode) {
    setView(m);
    if (m === "schema") {
      if (schemaSupported === null) loadSchema();
      loadFieldReport();
    }
  }

  const primaryBtn = `btn rounded-full ${ui.primary}`;
  const patchPreview = useMemo(() => {
    if (panel !== "update") return null;
    try {
      return looseJsonParse(patchDraft);
    } catch {
      return null;
    }
  }, [panel, patchDraft]);

  // Backfill preview: the normal preview samples the current page (which often
  // already has the field, so before == after). Instead query the docs the
  // backfill would actually touch — those missing the patched keys — and show a
  // real count + sample. Debounced; re-runs as the patch or query changes.
  useEffect(() => {
    if (panel !== "update" || !backfillMissing) {
      setBackfillInfo(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      let patch: unknown;
      try {
        patch = looseJsonParse(patchDraft);
      } catch {
        return;
      }
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        if (!cancelled) setBackfillInfo(null);
        return;
      }
      try {
        const filter = backfillFilterFor(patch as Record<string, unknown>);
        const params = new URLSearchParams({
          limit: "2",
          skip: "0",
          filter: JSON.stringify(filter),
        });
        const res = await call<{ data: Doc[]; total?: number }>(`/services/${svc.key}?${params}`);
        if (!cancelled) setBackfillInfo({ sample: res.data, total: res.total ?? res.data.length });
      } catch {
        if (!cancelled) setBackfillInfo(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [panel, backfillMissing, patchDraft, applied]);

  const views: { mode: ViewMode; icon: ReactElement; title: string }[] = [
    { mode: "cards", icon: <Icon.Squares className="size-5" />, title: "cards view" },
    { mode: "raw", icon: <Icon.Code className="size-5" />, title: "raw JSON view" },
    { mode: "table", icon: <Icon.Table className="size-5" />, title: "table view" },
    { mode: "schema", icon: <Icon.Cog className="size-5" />, title: "schema / promoted columns" },
  ];

  return (
    <div className={`p-5 ${visible ? "" : "hidden"}`}>
      {/* row 1 — actions + views */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="dropdown">
          <button type="button" tabIndex={0} className={primaryBtn}>
            <Icon.Plus className="size-5" /> ADD DATA
          </button>
          <ul
            tabIndex={0}
            className="menu dropdown-content z-40 mt-1 w-52 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
          >
            <li>
              <a onClick={() => openEditor("new")}>Insert document(s)</a>
            </li>
            <li>
              <a onClick={() => fileRef.current?.click()}>Import JSON file…</a>
            </li>
          </ul>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) importFile(f);
              (e.target as HTMLInputElement).value = "";
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost rounded-full"
          title="patch every document matching the current query"
          onClick={() => {
            setEditing(null);
            setPanel(panel === "update" ? null : "update");
          }}
        >
          <Icon.Pencil className="size-5" /> UPDATE
        </button>
        <button
          type="button"
          className="btn btn-ghost rounded-full"
          title="delete every document matching the current query"
          onClick={() => {
            setEditing(null);
            setPanel(panel === "delete" ? null : "delete");
          }}
        >
          <Icon.XMark className="size-5" /> DELETE
        </button>
        <button
          type="button"
          className="btn btn-ghost rounded-full"
          title="download current query as JSON"
          onClick={exportJson}
        >
          <Icon.Download className="size-5" /> EXPORT
        </button>
        <span className="flex-1" />
        {view === "cards" && (
          <div className="join">
            <button
              type="button"
              className="btn btn-square join-item"
              title="expand all"
              onClick={() => setExpandSignal({ mode: "expand", tick: Date.now() })}
            >
              <Icon.ExpandAll className="size-5" />
            </button>
            <button
              type="button"
              className="btn btn-square join-item"
              title="collapse all"
              onClick={() => setExpandSignal({ mode: "collapse", tick: Date.now() })}
            >
              <Icon.CollapseAll className="size-5" />
            </button>
          </div>
        )}
        <div className="join">
          {views.map((v) => (
            <button
              key={v.mode}
              type="button"
              title={v.title}
              className={`btn btn-square join-item ${
                view === v.mode ? "btn-active text-primary" : ""
              }`}
              onClick={() => switchView(v.mode)}
            >
              {v.icon}
            </button>
          ))}
        </div>
      </div>

      {/* row 2 — query (hidden in schema view) */}
      {view !== "schema" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <QueryBar fields={fields} value={filter} onChange={setFilter} onFind={find} lint={lint} />
          <button
            type="button"
            className={primaryBtn}
            disabled={lint.level === "error"}
            onClick={find}
          >
            <Icon.Search className="size-5" /> FIND
          </button>
          <button type="button" className="btn btn-ghost rounded-full" onClick={reset}>
            RESET
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-base-content/70">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={showDeleted}
              onChange={(e) => {
                const next = (e.target as HTMLInputElement).checked;
                setShowDeleted(next);
                setSkip(0);
                load(applied, 0, next);
              }}
            />
            deleted
          </label>
          <select
            className="select select-bordered select-sm ml-auto font-mono text-xs"
            value={limit}
            title="page size"
            onChange={(e) => {
              const next = Number((e.target as HTMLSelectElement).value);
              setLimit(next);
              setSkip(0);
              load(applied, 0, showDeleted, next);
            }}
          >
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-sm text-base-content/60">
            {total === 0 ? "0" : `${skip + 1}–${skip + docs.length}`} of {total}
          </span>
          <div className="join">
            <button
              type="button"
              className="btn btn-square join-item"
              disabled={skip === 0}
              onClick={() => {
                const next = Math.max(0, skip - limit);
                setSkip(next);
                load(applied, next);
              }}
            >
              <Icon.ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              className="btn btn-square join-item"
              disabled={skip + limit >= total}
              onClick={() => {
                const next = skip + limit;
                setSkip(next);
                load(applied, next);
              }}
            >
              <Icon.ChevronRight className="size-5" />
            </button>
          </div>
          <button
            type="button"
            className="btn btn-circle"
            title="refresh"
            onClick={() => load()}
          >
            <Icon.Refresh className="size-5" />
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error alert-soft mb-3 font-mono text-sm font-medium">
          ✗ {error}
        </div>
      )}
      {notice && !error && (
        <div className="alert alert-success alert-soft mb-3 font-mono text-sm font-medium">
          ✓ {notice}
        </div>
      )}

      {/* bulk update panel — Compass-style: patch + preview of what changes */}
      {panel === "update" && (
        <div className="mb-3 rounded-2xl border-l-4 border-primary bg-base-200 p-4 text-sm">
          <div className="mb-1.5 text-base-content/60">
            UPDATE applies this patch to <b className="text-base-content">all {total} documents</b>
            {" "}
            matching the current query {applied.trim() ? <code>{applied}</code> : "(everything)"}
            {" "}
            — merge semantics, every version bumps.
          </div>
          <textarea
            className="textarea textarea-bordered min-h-28 w-full font-mono text-sm"
            value={patchDraft}
            onChange={(e) => setPatchDraft((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              const el = e.target as HTMLTextAreaElement;
              handlePairKey(e, el, (next, s, en) => {
                setPatchDraft(next);
                queueMicrotask(() => {
                  el.focus();
                  el.setSelectionRange(s, en);
                });
              });
            }}
          />
          {!backfillMissing && patchPreview !== null && docs.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[11px] text-base-content/60">
                preview (first {Math.min(2, docs.length)} of {total}):
              </div>
              {docs.slice(0, 2).map((d) => (
                <div key={d.id} className="mb-1.5 flex items-center gap-2">
                  <pre className="flex-1 overflow-x-auto rounded-xl bg-base-300/40 p-2 text-[11px] text-base-content/60">{JSON.stringify(d, null, 1)}</pre>
                  <Icon.ArrowRight className="size-5 shrink-0 text-primary" />
                  <pre className="flex-1 overflow-x-auto rounded-xl bg-primary/10 p-2 text-[11px]">{JSON.stringify(mergePreview(d, patchPreview), null, 1)}</pre>
                </div>
              ))}
            </div>
          )}
          {backfillMissing && patchPreview !== null && backfillInfo !== null && (
            <div className="mt-2">
              <div className="mb-1 text-[11px] text-base-content/60">
                {backfillInfo.total === 0
                  ? "✓ no documents are missing these fields in storage — nothing to backfill"
                  : (
                    <>
                      backfill targets{" "}
                      <b className="text-base-content">
                        {backfillInfo.total} document{backfillInfo.total === 1 ? "" : "s"}
                      </b>{" "}
                      missing these fields — preview:
                    </>
                  )}
              </div>
              {backfillInfo.sample.slice(0, 2).map((d) => (
                <div key={d.id} className="mb-1.5 flex items-center gap-2">
                  <pre className="flex-1 overflow-x-auto rounded-xl bg-base-300/40 p-2 text-[11px] text-base-content/60">{JSON.stringify(d, null, 1)}</pre>
                  <Icon.ArrowRight className="size-5 shrink-0 text-primary" />
                  <pre className="flex-1 overflow-x-auto rounded-xl bg-primary/10 p-2 text-[11px]">{JSON.stringify(mergePreview(d, patchPreview), null, 1)}</pre>
                </div>
              ))}
            </div>
          )}
          <label className="mt-2 flex items-center gap-1.5 text-[11px] text-base-content/60">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={backfillMissing}
              onChange={(e) => setBackfillMissing((e.target as HTMLInputElement).checked)}
            />
            backfill — only set these fields on documents that don't already have them (add a new
            field without overwriting existing values)
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={primaryBtn}
              disabled={backfillMissing && backfillInfo?.total === 0}
              onClick={bulkUpdate}
            >
              {backfillMissing
                ? backfillInfo
                  ? `BACKFILL ${backfillInfo.total} DOC${backfillInfo.total === 1 ? "" : "S"}`
                  : "BACKFILL MISSING FIELDS"
                : `APPLY TO ${total} DOCS`}
            </button>
            <button
              type="button"
              className="btn btn-ghost rounded-full"
              onClick={() => setPanel(null)}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* bulk delete panel */}
      {panel === "delete" && (
        <div className="mb-3 rounded-2xl border-l-4 border-error bg-base-200 p-4 text-sm">
          <div className="mb-2 text-base-content">
            DELETE <b className="text-error">all {total} documents</b> matching{" "}
            {applied.trim() ? <code>{applied}</code> : "(everything)"} —{" "}
            {hardBulk ? "permanently, no restore" : "soft delete, restorable"}.
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-base-content/60">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={hardBulk}
              onChange={(e) => setHardBulk((e.target as HTMLInputElement).checked)}
            />
            hard delete (cannot be undone)
          </label>
          <div className="mt-2.5 flex gap-2">
            <button type="button" className="btn btn-error rounded-full" onClick={bulkDelete}>
              DELETE {total} DOCS
            </button>
            <button
              type="button"
              className="btn btn-ghost rounded-full"
              onClick={() => setPanel(null)}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* insert/edit editor */}
      {editing !== null && (
        <div className="mb-3 rounded-2xl border-l-4 border-primary bg-base-200 p-4 text-sm">
          <div className="mb-1.5 text-base-content/60">
            {editing === "new"
              ? `insert into ${svc.collection} — one document or an array of documents`
              : `patch ${editing.id} — merge semantics, version ${editing.version} will bump`}
          </div>
          <textarea
            className="textarea textarea-bordered min-h-36 w-full font-mono text-sm"
            value={draft}
            onChange={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              const el = e.target as HTMLTextAreaElement;
              handlePairKey(e, el, (next, s, en) => {
                setDraft(next);
                queueMicrotask(() => {
                  el.focus();
                  el.setSelectionRange(s, en);
                });
              });
            }}
          />
          <div className="mt-2 flex gap-2">
            <button type="button" className={primaryBtn} onClick={save}>
              {editing === "new" ? "INSERT" : "UPDATE"}
            </button>
            <button
              type="button"
              className="btn btn-ghost rounded-full"
              onClick={() => setEditing(null)}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* ── views ── */}
      {view === "cards" &&
        docs.map((d) => (
          <DocCard
            key={d.id}
            doc={d}
            ui={ui}
            expandSignal={expandSignal}
            onPatch={async (patch) => {
              await post(`/services/${svc.key}/${d.id}`, patch);
              setNotice(`patched ${d.id.slice(0, 8)}…`);
              await load();
            }}
            onDuplicate={() => duplicateDoc(d)}
            onDelete={(hard) =>
              act(`/services/${svc.key}/${d.id}${hard ? "?hard=true" : ""}`, { method: "DELETE" })}
            onRestore={() => act(`/services/${svc.key}/${d.id}/restore`, { method: "POST" })}
          />
        ))}

      {view === "raw" &&
        docs.map((d) => (
          <pre
            key={d.id}
            className={`mb-3 overflow-x-auto rounded-2xl bg-base-200 px-4 py-3 font-mono text-xs ${
              d.meta?.deleted_at != null ? "opacity-55" : ""
            }`}
          >{JSON.stringify(d, null, 2)}</pre>
        ))}

      {view === "table" && (
        <div className="overflow-x-auto rounded-2xl bg-base-200">
          <table className="table font-mono text-[13px]">
            <thead>
              <tr>
                <th>id</th>
                {columns.map((c) => <th key={c}>{c}</th>)}
                <th>v</th>
                <th>state</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const deleted = d.meta?.deleted_at != null;
                return (
                  <tr key={d.id} className={deleted ? "opacity-50" : ""}>
                    <td className="max-w-56 truncate text-error" title={d.id}>
                      {d.id.slice(0, 8)}…
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c}
                        className={`max-w-56 truncate ${valueClass(d[c])}`}
                        title={fmtValue(d[c])}
                      >
                        {fmtValue(d[c])}
                      </td>
                    ))}
                    <td>{d.version ?? "·"}</td>
                    <td className={deleted ? "text-error" : "text-success"}>
                      {deleted ? "deleted" : "active"}
                    </td>
                    <td className="whitespace-nowrap">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-circle"
                        title="edit"
                        onClick={() => openEditor(d)}
                      >
                        <Icon.Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-circle"
                        title="duplicate"
                        onClick={() => duplicateDoc(d)}
                      >
                        <Icon.Duplicate className="size-4" />
                      </button>
                      {deleted
                        ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-circle"
                            title="restore"
                            onClick={() =>
                              act(`/services/${svc.key}/${d.id}/restore`, { method: "POST" })}
                          >
                            <Icon.Restore className="size-4" />
                          </button>
                        )
                        : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-circle text-error"
                            title="soft delete"
                            onClick={() =>
                              act(`/services/${svc.key}/${d.id}`, { method: "DELETE" })}
                          >
                            <Icon.XMark className="size-4" />
                          </button>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "schema" && (
        <>
          <FieldsPanel
            report={fieldReport}
            onBackfill={backfillField}
            onDrop={dropOrphanField}
            ui={ui}
          />
          <SchemaPanel
            supported={schemaSupported}
            columns={schemaCols}
            onDrop={dropSchemaColumn}
            onMigrate={migrateSchemaColumn}
            ui={ui}
          />
        </>
      )}

      {view !== "schema" && docs.length === 0 && (
        <div className="p-8 font-mono text-sm text-base-content/60">no documents</div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── studio ──

function initialTheme(): ThemeName {
  try {
    const stored = localStorage.getItem("howl-studio-theme");
    if (stored === "dark" || stored === "light") return stored;
    if (globalThis.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    // no storage (SSR / privacy mode) — fall through to dark
  }
  return "dark";
}

/**
 * The studio admin panel. Mount it inside an island (or any hydrated React
 * tree) and point it at the middleware's API:
 *
 * ```tsx
 * <Studio endpoint="/studio/api" style={{ primaryColor: "btn-accent" }} />
 * ```
 *
 * Styled with daisyUI — the host app (or standalone mode's CDN) must provide
 * daisyUI/Tailwind for the classes to take effect.
 */
export function Studio(
  { endpoint = "/studio/api", fullscreen = false, style }: StudioProps,
): ReactElement {
  const [services, setServices] = useState<ServiceMeta[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [theme, setTheme] = useState<ThemeName>(() => style?.theme ?? initialTheme());
  const [error, setError] = useState("");

  const ui: Ui = {
    primary: style?.primaryColor ?? "btn-primary",
    secondary: style?.secondaryColor ?? "btn-secondary",
  };

  useEffect(() => {
    fetch(`${endpoint}/meta`)
      .then((r) => r.json())
      .then((meta: { services: ServiceMeta[] }) => {
        setServices(meta.services);
        if (meta.services.length > 0) {
          setTabs([meta.services[0].key]);
          setActive(meta.services[0].key);
        }
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("howl-studio-theme", next);
    } catch {
      // storage unavailable — theme just won't persist
    }
  }

  function openTab(key: string) {
    setTabs((t) => t.includes(key) ? t : [...t, key]);
    setActive(key);
  }
  function closeTab(key: string) {
    setTabs((t) => {
      const next = t.filter((x) => x !== key);
      if (active === key) setActive(next[next.length - 1] ?? "");
      return next;
    });
  }

  const groups = useMemo(() => {
    const byBackend = new Map<string, ServiceMeta[]>();
    for (const s of services) {
      byBackend.set(s.backend, [...byBackend.get(s.backend) ?? [], s]);
    }
    return [...byBackend.entries()];
  }, [services]);

  return (
    <div
      data-theme={theme}
      // Bump daisyUI's radius tokens app-wide → rounder buttons / inputs / cards.
      style={{
        "--radius-box": "1.25rem",
        "--radius-field": "0.85rem",
        "--radius-selector": "0.85rem",
      } as Record<string, string>}
      className={`flex overflow-hidden bg-base-100 font-sans text-base-content ${
        fullscreen ? "h-screen" : "h-140 rounded-box"
      }`}
    >
      {/* sidebar — fixed; only its connections list scrolls when it overflows */}
      <aside className="flex w-80 shrink-0 flex-col bg-base-200">
        <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-5">
          <span className="text-lg font-bold tracking-tight">
            HOWL <span className="text-warning">{WORDMARK_SEP}</span> STUDIO
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            title="toggle theme"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Icon.Sun className="size-5" /> : <Icon.Moon className="size-5" />}
          </button>
        </div>
        <div className="shrink-0 px-5 pb-2 text-xs font-semibold uppercase tracking-wider text-base-content/50">
          Connections ({groups.length})
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-2 pb-3">
          {groups.map(([backend, list]) => {
            const accent: Accent = backendAccent(backend);
            return (
              <div key={backend}>
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${accent.text}`}
                >
                  <span className={`size-2 rounded-full ${accent.bg}`} />
                  {backend}
                </div>
                {list.map((s) => (
                  <button
                    type="button"
                    key={s.key}
                    onClick={() => openTab(s.key)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium transition-colors ${
                      active === s.key
                        ? `${accent.bg}/15 ${accent.text}`
                        : "text-base-content/70 hover:bg-base-300/60 hover:text-base-content"
                    }`}
                  >
                    <Icon.Collection className="size-5 opacity-80" />
                    {s.key}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </aside>

      {/* main — fixed header (tabs); only the content area below scrolls */}
      <main className="flex min-w-0 flex-1 flex-col bg-base-100">
        <div className="flex shrink-0 items-stretch gap-1 overflow-x-auto px-3 pt-2">
          {tabs.map((key) => {
            const svc = services.find((s) => s.key === key);
            if (!svc) return null;
            const isActive = key === active;
            const accent = backendAccent(svc.backend);
            return (
              <div
                key={key}
                onClick={() => setActive(key)}
                className={`flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-base-200 text-base-content"
                    : "text-base-content/55 hover:bg-base-200/50 hover:text-base-content"
                }`}
              >
                <span className={`size-2 rounded-full ${accent.bg}`} />
                {svc.collection}
                <span
                  title="close tab"
                  className="rounded-full p-0.5 text-base-content/50 hover:bg-base-300 hover:text-base-content"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(key);
                  }}
                >
                  <Icon.XMark className="size-4" />
                </span>
              </div>
            );
          })}
        </div>

        {error && <div className="shrink-0 p-4 text-sm text-error">✗ {error}</div>}

        <div className="flex-1 overflow-y-auto">
          {tabs.map((key) => {
            const svc = services.find((s) => s.key === key);
            if (!svc) return null;
            return (
              <CollectionTab
                key={key}
                svc={svc}
                endpoint={endpoint}
                visible={key === active}
                ui={ui}
              />
            );
          })}
          {tabs.length === 0 && (
            <div className="p-8 text-sm text-base-content/60">
              open a collection from the sidebar
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
