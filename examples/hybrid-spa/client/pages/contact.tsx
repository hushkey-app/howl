import { Head } from "@hushkey/howl/runtime";
import type { JSX } from "preact/jsx-runtime";
import { Context } from "@hushkey/howl";
import { State } from "../../howl.config.ts";

export default function contact(_ctx: Context<State>): JSX.Element {
  return (
    <>
      <Head>
        <title>SSR_1 PAGE</title>
      </Head>
      <p>SSR_1 CONTACT PAGE</p>
    </>
  );
}
