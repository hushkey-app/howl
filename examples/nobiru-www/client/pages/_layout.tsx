import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { AppleLogo } from "@/components/ui/apple-logo.tsx";
import { Button } from "@/components/ui/button.tsx";
import { APP_STORE_URL, PRICE } from "../../shared/facts.ts";

const NAV_LINKS = [
  { hash: "#features", label: "Features" },
  { hash: "#watch", label: "Apple Watch" },
  { hash: "#reports", label: "Reports" },
];

/** Chrome shared by every page: a thin top bar and a plain footer. */
export default function Layout(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  const price = props.state.client?.price ?? PRICE;
  const storeUrl = props.state.client?.appStoreUrl ?? APP_STORE_URL;

  // Section anchors live on the landing page — from anywhere else they need the
  // path in front of them, and a real load so the fragment is honoured (client
  // nav replays the server URL, which drops it).
  const onHome = props.url.pathname === "/";
  const sectionHref = (hash: string) => (onHome ? hash : `/${hash}`);
  const sectionNav = onHome ? undefined : ("false" as const);

  return (
    <div className="flex min-h-screen flex-col">
      {/* The offer, stated before anything else on the page. */}
      <p className="bg-primary px-5 py-2 text-center text-xs text-primary-foreground">
        Everything included for {price}, once — no subscription, no account, every future update.
      </p>

      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-5">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/logo-192.png" alt="" className="size-7" />
            Nobiru
          </a>

          <div className="ml-auto hidden items-center gap-5 sm:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.hash}
                href={sectionHref(link.hash)}
                client-nav={sectionNav}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </div>

          <Button asChild size="sm" className="ml-auto sm:ml-0">
            <a href={storeUrl} target="_blank" rel="noreferrer">
              <AppleLogo />
              Get it — {price}
            </a>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 font-semibold tracking-tight">
              <img src="/logo-192.png" alt="" className="size-7" />
              Nobiru
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Gym and nutrition tracking for iPhone and Apple Watch. Bought once — no subscription,
              no account, no ads.
            </p>
          </div>

          <div className="flex gap-12">
            <div>
              <p className="text-sm font-medium">App</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {NAV_LINKS.map((link) => (
                  <li key={link.hash}>
                    <a
                      href={sectionHref(link.hash)}
                      client-nav={sectionNav}
                      className="transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href={sectionHref("#faq")}
                    client-nav={sectionNav}
                    className="transition-colors hover:text-foreground"
                  >
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">Legal</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/privacy" className="transition-colors hover:text-foreground">Privacy</a>
                </li>
                <li>
                  <a
                    href="mailto:support@nobiru.app"
                    className="transition-colors hover:text-foreground"
                  >
                    Support
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 px-5 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Nobiru. Tracking guides only — not medical advice.</p>
            <p>
              Built with{" "}
              <a href="https://jsr.io/@hushkey/howl" className="underline underline-offset-4">
                Howl
              </a>{" "}
              · Apple, Apple Watch and HealthKit are trademarks of Apple Inc.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
