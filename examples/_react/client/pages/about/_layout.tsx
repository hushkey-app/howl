import type { ReactPageProps } from "@hushkey/howl-react";

/** Nested layout under `/about` — mirrors vuety's `about/_layout.vue`. */
export default function AboutLayout(props: ReactPageProps) {
  const Outlet = props.Component!;
  return (
    <div className="p-5">
      <h1 className="text-lg font-semibold text-secondary mb-3">Nested Layout</h1>
      <Outlet />
    </div>
  );
}
