import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";
import { Button } from "@/components/ui/button.tsx";

const MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "This page does not exist",
  500: "Something went wrong on our end",
};

/** Error page. */
export default function ErrorPage(props: ReactPageProps) {
  const status = (props.error as { status?: number })?.status ?? 500;
  const message = MESSAGES[status] ?? "Unknown error";

  useHead({ title: `${status} — Nobiru` });

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-medium text-primary">Error {status}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{message}</h1>
      <p className="mt-3 text-muted-foreground">
        Head back to the start and pick up where you left off.
      </p>
      <Button asChild className="mt-8">
        <a href="/" client-nav="true">Back home</a>
      </Button>
    </section>
  );
}
