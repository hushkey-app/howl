import type { ReactPageProps } from "@hushkey/howl-react";
import { Button } from "@/components/ui/button.tsx";

const errorMap: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error",
};

export default function ErrorPage(props: ReactPageProps) {
  const error = props.error as { status?: number; message?: string } | null;
  const status = error?.status ?? 500;
  const message = errorMap[status] ?? "Unknown error";
  return (
    <main className="mx-auto my-20 max-w-xl text-center">
      <h1 className="mb-2 text-6xl font-bold text-destructive">{status}</h1>
      <h2 className="mb-2 text-2xl font-semibold">Oops!</h2>
      <p className="mb-6 text-muted-foreground">{message}</p>
      <Button asChild>
        <a href="/">Go back home</a>
      </Button>
    </main>
  );
}
