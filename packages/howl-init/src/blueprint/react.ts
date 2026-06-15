import type { ProjectSpec, UiKit } from "../spec.ts";
import { shadcnButton, shadcnCard, shadcnUtils } from "./styles.ts";

/** All React client files for a fullstack-react project (keyed by rel path). */
export function reactFiles(spec: ProjectSpec): Record<string, string> {
  const ui = spec.ui as UiKit;
  const files: Record<string, string> = {
    "client/howl-react.d.ts": howlReactDts(),
    "client/pages/_app.tsx": appTsx(ui),
    "client/pages/index.tsx": indexTsx(spec.name, ui),
    "client/pages/_error.tsx": errorTsx(ui),
  };
  if (ui === "shadcn") {
    files["client/lib/utils.ts"] = shadcnUtils();
    files["client/components/ui/button.tsx"] = shadcnButton();
    files["client/components/ui/card.tsx"] = shadcnCard();
  }
  return files;
}

function howlReactDts(): string {
  return `// Adds Howl-React's client-navigation attributes to JSX (e.g. <body client-nav>).
import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    /** Opt a subtree into client-side navigation (in-place region swap). */
    "client-nav"?: boolean | "true" | "false";
    /** Opt a subtree into prefetch-on-intent (hover / touch / focus). */
    "client-prefetch"?: boolean | "true" | "false";
  }
}
`;
}

function bodyClass(ui: UiKit): string {
  if (ui === "daisyui") return ` data-theme="light"`;
  return "";
}

function appTsx(ui: UiKit): string {
  const bodyAttr = ui === "daisyui"
    ? `client-nav="true" client-prefetch="true" className="bg-base-100 text-base-content min-h-screen"`
    : ui === "shadcn"
    ? `client-nav="true" client-prefetch="true" className="min-h-screen antialiased"`
    : `client-nav="true" client-prefetch="true" className="min-h-screen bg-white text-neutral-900"`;
  return `import type { ReactPageProps } from "@hushkey/howl-react";

/** Document shell — owns the whole <html>. The page tree mounts in #howl-app. */
export default function App(props: ReactPageProps) {
  const Outlet = props.Component!;
  return (
    <html lang="en"${bodyClass(ui)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body ${bodyAttr}>
        <Outlet />
      </body>
    </html>
  );
}
`;
}

function indexTsx(name: string, ui: UiKit): string {
  if (ui === "shadcn") {
    return `import { useState } from "react";
import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";

export default function Index(props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useState(0);
  const [pong, setPong] = useState<string | null>(null);

  useHead({ title: "${name}", meta: [{ name: "description", content: "A Howl + React + shadcn/ui app." }] });

  async function ping() {
    const res = await fetch("/api/public/ping");
    const data = await res.json();
    setPong(data.message);
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">⚛️ {props.state.title}</h1>
        <p className="text-muted-foreground">React on Howl, styled with shadcn/ui. No Vite.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Counter</CardTitle>
          <CardDescription>Client interactivity after hydration.</CardDescription>
        </CardHeader>
        <CardContent className="text-2xl font-semibold tabular-nums">{count}</CardContent>
        <CardFooter className="gap-2">
          <Button onClick={() => setCount(count + 1)}>Increment</Button>
          <Button variant="secondary" onClick={() => setCount(0)}>Reset</Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>API call</CardTitle>
          <CardDescription>Fetch the typed /api/public/ping route.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{pong ?? "Not called yet."}</CardContent>
        <CardFooter>
          <Button variant="outline" onClick={ping}>Ping</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
`;
  }
  const btn = ui === "daisyui"
    ? {
      primary: "btn btn-primary btn-sm",
      ghost: "btn btn-outline btn-sm",
      muted: "text-base-content/70",
    }
    : {
      primary: "rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700",
      ghost: "rounded border px-3 py-1.5 text-sm hover:bg-neutral-100",
      muted: "text-neutral-500",
    };
  return `import { useState } from "react";
import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";

export default function Index(props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useState(0);
  const [pong, setPong] = useState<string | null>(null);

  useHead({ title: "${name}", meta: [{ name: "description", content: "A Howl + React app." }] });

  async function ping() {
    const res = await fetch("/api/public/ping");
    const data = await res.json();
    setPong(data.message);
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">⚛️ {props.state.title}</h1>
        <p className="${btn.muted}">React on Howl. SSR → hydrate → SPA. No Vite.</p>
      </header>
      <section className="space-y-2">
        <p className="text-lg font-semibold">Count: {count}</p>
        <div className="flex gap-2">
          <button type="button" className="${btn.primary}" onClick={() => setCount(count + 1)}>Increment</button>
          <button type="button" className="${btn.ghost}" onClick={() => setCount(0)}>Reset</button>
        </div>
      </section>
      <section className="space-y-2">
        <button type="button" className="${btn.ghost}" onClick={ping}>Ping the API</button>
        <p className="${btn.muted}">{pong ?? "Not called yet."}</p>
      </section>
    </main>
  );
}
`;
}

function errorTsx(ui: UiKit): string {
  const accent = ui === "shadcn"
    ? "text-destructive"
    : ui === "daisyui"
    ? "text-error"
    : "text-red-600";
  const muted = ui === "daisyui"
    ? "text-base-content/70"
    : ui === "shadcn"
    ? "text-muted-foreground"
    : "text-neutral-500";
  return `import type { ReactPageProps } from "@hushkey/howl-react";

export default function ErrorPage(props: ReactPageProps) {
  const error = props.error as { status?: number; message?: string } | null;
  const status = error?.status ?? 500;
  return (
    <main className="mx-auto my-20 max-w-xl text-center">
      <h1 className="mb-2 text-6xl font-bold ${accent}">{status}</h1>
      <p className="mb-6 ${muted}">{error?.message ?? "Something went wrong."}</p>
      <a href="/" className="underline">Go back home</a>
    </main>
  );
}
`;
}
