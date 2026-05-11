import { Head } from "@hushkey/howl/runtime";
import type { Context } from "@hushkey/howl";
import type { State } from "../../../howl.config.ts";
import type { JSX } from "preact/jsx-runtime";

export default function Index(_ctx: Context<State>): JSX.Element {
  // console.log(_ctx);
  return (
    <>
      <Head>
        <title>AOT PAGE</title>
      </Head>

      <p>FIRST AOT PAGE</p>
    </>
  );
}
