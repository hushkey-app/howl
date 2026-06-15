import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

export default function About(props: ReactPageProps<unknown, State>) {
  useHead({
    title: "About · Howl + shadcn/ui",
    meta: [{ name: "description", content: "About this shadcn-on-Howl demo." }],
  });

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>📖 About</CardTitle>
          <CardDescription>
            Served at <code className="rounded bg-muted px-1 py-0.5">{props.url.pathname}</code>
            {" "}
            by Howl's file-system router — no React Router involved.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Every component on this page is a vendored shadcn/ui primitive
          (<code className="rounded bg-muted px-1 py-0.5">client/components/ui</code>), styled with
          Tailwind v4 tokens — exactly the workflow community users expect.
        </CardContent>
      </Card>
    </main>
  );
}
