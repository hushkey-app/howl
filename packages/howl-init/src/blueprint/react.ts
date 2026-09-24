import type { ProjectSpec, UiKit } from "../spec.ts";
import { shadcnButton, shadcnCard, shadcnNavigationMenu, shadcnUtils } from "./styles.ts";

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
    files["client/components/ui/navigation-menu.tsx"] = shadcnNavigationMenu();
    files["client/components/site-header.tsx"] = siteHeaderTsx();
    files["client/pages/_layout.tsx"] = layoutTsx();
    files["client/pages/about.tsx"] = aboutTsx(spec.name);
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
    return `import { useEffect, useState } from "react";
import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";

export default function Index(props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useState(0);
  const [pong, setPong] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useHead({ title: "${name}", meta: [{ name: "description", content: "A Howl + React + shadcn/ui app." }] });

  async function ping() {
    const res = await fetch("/api/public/ping");
    const data = await res.json();
    setPong(data.message);
  }

  // Both modal buttons close it and reset the page — nothing to submit yet.
  function closeModal() {
    setModalOpen(false);
    setCount(0);
    setPong(null);
  }

  function continueModal() {
    // Call your API here, then close.
    closeModal();
  }

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [modalOpen]);

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
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
      <Card>
        <CardHeader>
          <CardTitle>Modal</CardTitle>
          <CardDescription>Continue or cancel — both close it and reset the page.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
        </CardFooter>
      </Card>
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle id="modal-title">Are you sure?</CardTitle>
              <CardDescription>This is a test modal. Wire an API call into Continue when you need one.</CardDescription>
            </CardHeader>
            <CardFooter className="justify-end gap-2">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={continueModal}>Continue</Button>
            </CardFooter>
          </Card>
        </div>
      )}
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
      backdrop: "fixed inset-0 z-50 grid place-items-center bg-black/50 p-4",
      panel: "card w-full max-w-sm bg-base-100 p-6 shadow-xl",
    }
    : {
      primary: "rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700",
      ghost: "rounded border px-3 py-1.5 text-sm hover:bg-neutral-100",
      muted: "text-neutral-500",
      backdrop: "fixed inset-0 z-50 grid place-items-center bg-black/50 p-4",
      panel: "w-full max-w-sm rounded-lg bg-white p-6 shadow-xl",
    };
  return `import { useEffect, useState } from "react";
import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";

export default function Index(props: ReactPageProps<unknown, State>) {
  const [count, setCount] = useState(0);
  const [pong, setPong] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useHead({ title: "${name}", meta: [{ name: "description", content: "A Howl + React app." }] });

  async function ping() {
    const res = await fetch("/api/public/ping");
    const data = await res.json();
    setPong(data.message);
  }

  // Both modal buttons close it and reset the page — nothing to submit yet.
  function closeModal() {
    setModalOpen(false);
    setCount(0);
    setPong(null);
  }

  function continueModal() {
    // Call your API here, then close.
    closeModal();
  }

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [modalOpen]);

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
      <section className="flex justify-end">
        <button type="button" className="${btn.primary}" onClick={() => setModalOpen(true)}>Open modal</button>
      </section>
      {modalOpen && (
        <div className="${btn.backdrop}" onClick={closeModal}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="${btn.panel}"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-title" className="text-lg font-semibold">Are you sure?</h2>
            <p className="mt-1 ${btn.muted}">This is a test modal. Wire an API call into Continue when you need one.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="${btn.ghost}" onClick={closeModal}>Cancel</button>
              <button type="button" className="${btn.primary}" onClick={continueModal}>Continue</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
`;
}

// The top bar lives in `_layout.tsx`, not `_app.tsx`: `_app` is static SSR
// markup that is never hydrated, so a nav there could not track the active
// route across client navigations. Layouts are part of the hydrated tree and
// reconcile (not remount) between pages, so the header persists and re-renders.
function layoutTsx(): string {
  return `import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { SiteHeader } from "@/components/site-header.tsx";

/** Wraps every page: persistent top bar above the page outlet. */
export default function Layout(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader title={props.state.title} />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
`;
}

function siteHeaderTsx(): string {
  return `import { useRoute } from "@hushkey/howl-react/router";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu.tsx";

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
];

/** Sticky, translucent top bar with the app name and primary navigation. */
export function SiteHeader({ title }: { title: string }) {
  const { path } = useRoute();
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            {title.charAt(0).toUpperCase()}
          </span>
          <span>{title}</span>
        </a>
        <NavigationMenu>
          <NavigationMenuList>
            {links.map((link) => (
              <NavigationMenuItem key={link.href}>
                <NavigationMenuLink href={link.href} active={path === link.href}>
                  {link.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </header>
  );
}
`;
}

function aboutTsx(name: string): string {
  return `import { useHead } from "@hushkey/howl-react/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";

const steps = [
  {
    title: "Run the dev server",
    description: "Live reload on port 8000. Pages, APIs and styles rebuild as you save.",
    code: "deno task dev",
  },
  {
    title: "Add a page",
    description: "Every file under client/pages is a route; the file path is the URL.",
    code: "client/pages/contact.tsx  →  /contact",
  },
  {
    title: "Add an API route",
    description: "Define it with defineApi; a typed client is regenerated into generated/http-client.ts.",
    code: "server/apis/public/hello.api.ts",
  },
  {
    title: "Make the UI yours",
    description: "shadcn/ui components are vendored in client/components/ui; theme tokens live in static/style.css.",
    code: "client/components/ui/button.tsx",
  },
  {
    title: "Ship it",
    description: "Build and serve, or compile everything into a single self-contained binary.",
    code: "deno task build && deno task start",
  },
];

export default function About() {
  useHead({ title: "About · ${name}", meta: [{ name: "description", content: "Getting started with this Howl app." }] });

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Getting started</h1>
        <p className="text-muted-foreground">Five steps from a fresh scaffold to a shipped app.</p>
      </header>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={step.title}>
            <Card>
              <CardHeader className="flex-row items-start gap-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="space-y-1.5">
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <code className="block rounded-md bg-muted px-3 py-2 font-mono text-sm">{step.code}</code>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
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
