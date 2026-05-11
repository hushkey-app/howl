import { Head } from "@hushkey/howl/runtime";
import type { Context } from "@hushkey/howl";
import type { State } from "../../howl.config.ts";
import type { JSX } from "preact/jsx-runtime";

export default function Index(_ctx: Context<State>): JSX.Element {
  return (
    <>
      <Head>
        <title>SSR PAGE</title>
      </Head>
      <h1>HELLO FROM SSR PAGE INDEX</h1>
    </>
  );
}
