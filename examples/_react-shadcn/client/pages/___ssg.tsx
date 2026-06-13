import { useHead } from "@hushkey/howl-react/head";
import { useAtom } from "@hushkey/howl-react/store";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { countAtom } from "../store/index.store.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

/**
 * Static (SSG, `___` prefix) page — prerendered to HTML at build time and served
 * as a static snapshot (no per-request render). It still hydrates into a live
 * SPA, and navigation to/from it uses the AOT client chunk.
 */
export default function Ssg(_props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useAtom(countAtom);

  useHead({
    title: "Static · Howl + shadcn/ui",
    meta: [{ name: "description", content: "A build-time prerendered SSG page." }],
  });

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>🧊 Static (SSG) page</CardTitle>
          <CardDescription>
            Prerendered at build time and served as a static file — no server render on request. It
            still hydrates into a live SPA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm">
              Counter starts at its build-time default, then is live after hydration:
            </span>
            <Button size="sm" onClick={() => setCount(count + 1)}>count = {count}</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A value computed in render (e.g.{" "}
            <code className="rounded bg-muted px-1">new Date()</code>) is not frozen — it recomputes
            on hydration and would mismatch the static HTML. View source to see the build artifact.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
