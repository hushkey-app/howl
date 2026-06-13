import { useHead } from "@hushkey/howl-react/head";
import { useAtom } from "@hushkey/howl-react/store";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Minus, Plus } from "lucide-react";
import { countAtom } from "../store/index.store.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

export default function Index(props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useAtom(countAtom);

  useHead({
    title: "Home · Howl + shadcn/ui",
    meta: [
      { name: "description", content: "A full React page on Howl, styled with shadcn/ui." },
    ],
  });

  return (
    <main className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">⚛️ Howl + shadcn/ui</h1>
        <p className="text-muted-foreground">
          A <code className="rounded bg-muted px-1 py-0.5 text-sm">.tsx</code>{" "}
          page rendered by React on the server (crawlable — view source!) at{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">{props.url.pathname}</code>, then
          hydrated into a live SPA. No Vite — just Deno + esbuild.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Counter</CardTitle>
          <CardDescription>
            A jotai atom shared across pages and persisted across client-nav.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setCount(count - 1)}>
              <Minus />
            </Button>
            <span className="min-w-12 text-center text-2xl font-semibold tabular-nums">
              {count}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCount(count + 1)}>
              <Plus />
            </Button>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={() => setCount(count + 1)}>Increment</Button>
          <Button variant="secondary" onClick={() => setCount(0)}>Reset</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server state</CardTitle>
          <CardDescription>
            Read straight off the SSR props — no fetch, no prop drilling.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            The server set the app title to{" "}
            <strong className="text-foreground">{props.state.title}</strong>.
          </p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="default" asChild>
            <a href="/about">Read more</a>
          </Button>
          <Button variant="ghost" asChild>
            <a href="/ssg">See the SSG page</a>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
