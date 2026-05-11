import type { PageProps } from "@hushkey/howl";
import type { State } from "../../howl.config.ts";
import type { JSX } from "preact/jsx-runtime";

export default function Layout(
  { Component }: PageProps<unknown, State>,
): JSX.Element {
  return (
    <div class="flex-1 pb-(--nav-h) sm:pb-0">
      <h1>LAYOUT-1</h1>
      <nav class="flex gap-4">
        <a href="/">SSR</a>
        <a href="/jobs">AOT</a>
        <a href="/about">SSG</a>
      </nav>
      <Component />
    </div>
  );
}
