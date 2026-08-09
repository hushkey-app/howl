import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Wash } from "@/components/wash.tsx";
import { Nav } from "@/components/nav.tsx";
import { Footer } from "@/components/footer.tsx";

/**
 * Chrome shared by every page: the wash behind everything, the floating pill
 * above it, and a thin footer. The layout survives client navigation, so the
 * audio context stays warm as pages swap underneath it.
 */
export default function Layout(props: ReactPageProps<unknown, State>) {
  const Outlet = props.Component!;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Wash />
      <Nav pathname={props.url.pathname} />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
