import type { PageProps } from "@hushkey/howl";
import type { State } from "../../../howl.config.ts";
import type { JSX } from "preact/jsx-runtime";

export default function Layout(
  { Component }: PageProps<unknown, State>,
): JSX.Element {
  return (
    <>
      <p>NESTED-LAYOUT-2</p>
      <Component />
    </>
  );
}
