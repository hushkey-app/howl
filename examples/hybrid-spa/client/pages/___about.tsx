import { Head } from "@hushkey/howl/runtime";
import type { JSX } from "preact/jsx-runtime";
import { Context } from "@hushkey/howl";
import { State } from "../../howl.config.ts";

export default function About(ctx: Context<State>): JSX.Element {
  return (
    <>
      <Head>
        <title>SSG PAGE</title>
      </Head>
      <p>STATIC ABOUT PAGE - {ctx.state.client.title}</p>
    </>
  );
}
