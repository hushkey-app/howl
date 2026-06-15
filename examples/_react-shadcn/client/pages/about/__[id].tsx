import { useHead } from "@hushkey/howl-react/head";
import { useAtom } from "@hushkey/howl-react/store";
import { useHowlState } from "@hushkey/howl-react/state";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { countAtom } from "../../store/index.store.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

/**
 * AOT route (`__` prefix) — navigated to entirely on the client (no server
 * round-trip), rendered from the AOT chunk. Still SSRs on a direct landing.
 */
export default function AboutId(props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useAtom(countAtom);
  const state = useHowlState<State>();

  useHead({
    title: `${props.params?.id} · About · Howl + shadcn/ui`,
    meta: [{ name: "description", content: "An AOT-navigated shadcn page on Howl." }],
  });

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>📖 About {props.params?.id}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Served at <code className="rounded bg-muted px-1 py-0.5">{props.url.pathname}</code>
            {" "}
            — this route is client-rendered on nav from its AOT chunk.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm">Shared counter:</span>
            <Button variant="secondary" size="sm" onClick={() => setCount(count + 1)}>
              clicked {count} times
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            From the auto-synced{" "}
            <code className="rounded bg-muted px-1 py-0.5">useHowlState()</code> mirror: app title =
            {" "}
            <strong className="text-foreground">{state.title}</strong>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
