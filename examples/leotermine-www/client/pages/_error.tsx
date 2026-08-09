import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import { Button } from "@/components/ui/button.tsx";
import { NAME } from "../../shared/profile.ts";

const MESSAGES: Record<number, string> = {
  400: "That request did not make sense",
  401: "You need to be signed in",
  403: "Not yours to look at",
  404: "There is nothing at this address",
  500: "Something broke on my end",
};

/** Error page — one card on the same surface as everything else. */
export default function ErrorPage(props: ReactPageProps) {
  const status = (props.error as { status?: number })?.status ?? 500;
  const message = MESSAGES[status] ?? "Unknown error";

  useHead({ title: `${status} — ${NAME}` });

  return (
    <section className="mx-auto flex min-h-[70dvh] max-w-2xl items-center px-5">
      <div className="card w-full rounded-[1.5rem] px-6 py-12 text-center">
        <p className="text-[0.7rem] uppercase tracking-[0.16em] text-ink-faint">Error {status}</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{message}</h1>
        <Button asChild variant="solid" size="md" className="mt-7">
          <a href="/" client-nav="true">Back home</a>
        </Button>
      </div>
    </section>
  );
}
