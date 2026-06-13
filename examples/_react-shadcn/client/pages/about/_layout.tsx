import type { ReactPageProps } from "@hushkey/howl-react";

/** Nested layout under `/about`. */
export default function AboutLayout(props: ReactPageProps) {
  const Outlet = props.Component!;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Nested layout</h2>
      <Outlet />
    </div>
  );
}
