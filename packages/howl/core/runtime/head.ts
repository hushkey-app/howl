import {
  type ComponentChildren,
  createContext,
  h,
  render,
} from "preact";
import { useLayoutEffect } from "preact/hooks";

/**
 * Preact context flag set to `true` while rendering the document `<head>`.
 * Components inspect this to opt out of behaviour that does not belong in head.
 */
export const HeadContext: ReturnType<typeof createContext<boolean>> = createContext(false);

/**
 * Props for the {@linkcode Head} component.
 */
export interface HeadProps {
  /** Children rendered inside the document `<head>`. */
  children?: ComponentChildren;
}

const HEAD_MARKER = "data-howl-head";

function naturalKey(node: HTMLElement): string | null {
  const tag = node.nodeName.toLowerCase();
  if (tag === "title" || tag === "base") return tag;
  if (tag === "meta") {
    const charset = node.getAttribute("charset");
    if (charset !== null) return "meta[charset]";
    const name = node.getAttribute("name");
    if (name) return `meta[name=${name}]`;
    const property = node.getAttribute("property");
    if (property) return `meta[property=${property}]`;
    const httpEquiv = node.getAttribute("http-equiv");
    if (httpEquiv) return `meta[http-equiv=${httpEquiv}]`;
    return null;
  }
  if (tag === "link") {
    const rel = node.getAttribute("rel");
    if (rel === "canonical" || rel === "icon" || rel === "manifest") {
      return `link[rel=${rel}]`;
    }
  }
  return null;
}

function findExisting(key: string): HTMLElement | null {
  if (key === "title" || key === "base") {
    return document.head.querySelector(key);
  }
  if (key === "meta[charset]") {
    return document.head.querySelector("meta[charset]");
  }
  // key looks like "meta[name=foo]" — turn into CSS selector
  const match = key.match(/^(meta|link)\[([\w-]+)=(.+)\]$/);
  if (!match) return null;
  const [, tag, attr, value] = match;
  return document.head.querySelector(`${tag}[${attr}="${CSS.escape(value)}"]`);
}

function ClientHead({ children }: HeadProps) {
  useLayoutEffect(() => {
    const tmp = document.createElement("div");
    render(
      h(HeadContext.Provider, { value: true }, children),
      tmp,
    );

    const appended: HTMLElement[] = [];
    const replaced: { incoming: HTMLElement; prev: HTMLElement }[] = [];
    let titleRestore: string | null = null;

    while (tmp.firstChild) {
      const node = tmp.firstChild;
      if (!(node instanceof HTMLElement)) {
        node.remove();
        continue;
      }

      // <title> is special — write to `document.title` directly. Browsers
      // pull the document title from the first <title> element, which makes
      // DOM replace/remove cycles fragile: any moment without a <title> in
      // <head> falls back to the URL. `document.title` is a plain string
      // property and is immune to those races.
      if (node.nodeName.toLowerCase() === "title") {
        if (titleRestore === null) titleRestore = document.title;
        document.title = node.textContent ?? "";
        node.remove();
        continue;
      }

      node.setAttribute(HEAD_MARKER, "");
      const key = naturalKey(node);
      const existing = key ? findExisting(key) : null;
      if (existing) {
        existing.replaceWith(node);
        replaced.push({ incoming: node, prev: existing });
      } else {
        document.head.appendChild(node);
        appended.push(node);
      }
    }

    return () => {
      for (const n of appended) n.remove();
      for (const { incoming, prev } of replaced) {
        incoming.replaceWith(prev);
      }
      if (titleRestore !== null) document.title = titleRestore;
      render(null, tmp);
    };
  });

  return null;
}

/**
 * Render its children into the document `<head>` (e.g. `<title>`, `<meta>`).
 *
 * On the server, wraps children in {@linkcode HeadContext} so the renderer
 * hoists them into the emitted `<head>` tagged with `data-howl-head`. In the
 * browser, mounts a component that syncs `document.head` after each commit:
 * `<title>` is written directly through `document.title` (avoiding element
 * races); singleton tags (`<base>`, keyed `<meta>`, canonical `<link>`)
 * upsert by natural key; anything else appends and tracks for clean unmount.
 */
export function Head(props: HeadProps): ComponentChildren {
  if (typeof document !== "undefined") {
    return h(ClientHead, props);
  }
  return h(HeadContext, { value: true }, props.children);
}
