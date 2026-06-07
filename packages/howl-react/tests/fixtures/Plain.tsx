import type { ReactPageProps } from "../../engine.ts";

/** Plain SSR fixture — echoes a couple of props, no head/store hooks. */
export default function Plain(props: ReactPageProps) {
  return (
    <main>
      <h1>Plain {String((props.params as { id?: string }).id ?? "none")}</h1>
      <p>path:{props.url.pathname}</p>
    </main>
  );
}
