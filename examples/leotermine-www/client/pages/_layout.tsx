import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Wash } from "@/components/wash.tsx";
import { Footer } from "@/components/footer.tsx";

/**
 * Chrome shared by every page: the wash behind everything, and a thin footer.
 *
 * There is no nav bar. The board carries its own links and switches, and a
 * project page carries its own back button, so a pill floating over both was
 * repeating what the page already said. The footer stays off the board too —
 * under a one-screen layout it would only add a scrollbar.
 */
export default function Layout(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;
  const isBoard = props.url.pathname === "/";

  return (
    <div className="site-shell relative isolate flex min-h-dvh flex-col">
      <Wash />
      <main className="flex-1">
        <Outlet />
      </main>
      {!isBoard && <Footer />}
    </div>
  );
}
