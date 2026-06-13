import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

/** Toggle the `dark` class on <html> — shadcn's class-based dark mode. */
function toggleTheme(): void {
  document.documentElement.classList.toggle("dark");
}

/** Shared layout — top nav with shadcn link styling + a dark-mode toggle. */
export default function Layout(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  const path = props.url.pathname;
  const link = (active: boolean) =>
    cn(
      "text-sm transition-colors hover:text-foreground",
      active ? "font-semibold text-foreground" : "text-muted-foreground",
    );
  return (
    <div className="mx-auto max-w-2xl p-5">
      <nav className="mb-6 flex items-center gap-4 border-b pb-3">
        <a href="/" className={link(path === "/")}>Home</a>
        <a href="/about" className={link(path === "/about")}>About</a>
        <a href="/about/12345" className={link(props.route === "/about/:id")}>ID (AOT)</a>
        <a href="/ssg" className={link(path === "/ssg")}>Static (SSG)</a>
        <span className="ml-auto text-xs text-muted-foreground">{path}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Toggle theme"
          onClick={toggleTheme}
        >
          <Sun className="hidden size-4 dark:block" />
          <Moon className="block size-4 dark:hidden" />
        </Button>
      </nav>
      <Outlet />
    </div>
  );
}
