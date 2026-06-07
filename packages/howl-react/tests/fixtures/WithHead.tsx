import { useHead } from "../../runtime/head.ts";
import { useHowlState } from "../../runtime/state.ts";
import type { ReactPageProps } from "../../engine.ts";

/** Fixture exercising `useHead` (SSR title/meta) + `useHowlState` (ctx.state). */
export default function WithHead(_props: ReactPageProps) {
  const state = useHowlState<{ title?: string }>();
  useHead({
    title: "Fixture Title",
    meta: [{ name: "description", content: "fixture-desc" }],
  });
  return <h1>state:{state.title ?? "none"}</h1>;
}
