import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import type { State } from "@howl/config";
import { Bento } from "@/components/bento.tsx";
import { LOCATION, NAME, ORIGIN, ROLE } from "../../shared/profile.ts";

/**
 * The home page: one board. Who he is in the middle, what he has built and
 * where he has worked packed around it, and the way to reach him in the
 * bottom-right corner.
 */
export default function Home(props: ReactPageProps<unknown, State>) {
  const origin = props.state.client?.origin ?? ORIGIN;
  const description =
    `${NAME} — ${ROLE.toLowerCase()} in ${LOCATION}, a decade in. Backend systems, distributed infrastructure and full-stack TypeScript.`;

  useHead({
    title: `${NAME} — ${ROLE}`,
    meta: [
      { name: "description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: `${NAME} — ${ROLE}` },
      { property: "og:description", content: description },
      { property: "og:url", content: origin },
    ],
    link: [{ rel: "canonical", href: origin }],
  });

  return (
    <div className="mx-auto w-full max-w-[72rem] px-4 pb-6 pt-6 sm:px-6">
      <Bento />
    </div>
  );
}
