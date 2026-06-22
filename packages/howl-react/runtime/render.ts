import {
  type ComponentType,
  createElement,
  isValidElement,
  type ReactNode,
} from "react";
import { renderToString as reactRenderToString } from "react-dom/server";

/**
 * Render a React component or element to an HTML string — the standalone,
 * request-free counterpart to `ctx.renderToString`. Use it for templates
 * authored **outside** the page/layout/request flow: emails, notifications,
 * cron-job output, or any place you need markup without a {@link Context}. It
 * is the React-engine drop-in for Preact's `render` from
 * `preact-render-to-string`.
 *
 * Accepts either a JSX element (mirroring `render(<App />)`) or a component plus
 * props (mirroring `ctx.renderToString(Component, props)`):
 *
 * ```tsx
 * import { renderToString } from "@hushkey/howl-react";
 *
 * const a = renderToString(<WelcomeEmail name={user.name} />);
 * const b = renderToString(WelcomeEmail, { name: user.name });
 * ```
 *
 * No `_app` shell, layouts, providers, or headers are applied — just the
 * component to markup.
 *
 * @param node A React element to render directly.
 * @returns The rendered HTML string.
 */
export function renderToString(node: ReactNode): string;
/**
 * Render a component to an HTML string by instantiating it with `props`.
 *
 * @param component The component to render.
 * @param props Props passed to the component (optional).
 * @returns The rendered HTML string.
 */
export function renderToString<P extends Record<string, unknown>>(
  component: ComponentType<P>,
  props?: P,
): string;
export function renderToString(
  componentOrNode: ReactNode | ComponentType<Record<string, unknown>>,
  props?: Record<string, unknown>,
): string {
  const node = isValidElement(componentOrNode)
    ? componentOrNode
    : createElement(
      componentOrNode as ComponentType<Record<string, unknown>>,
      props ?? undefined,
    );
  return reactRenderToString(node);
}
