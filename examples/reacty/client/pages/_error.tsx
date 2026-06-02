import type { ReactPageProps } from "@hushkey/howl-react";

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
    <main className="container">
      <section className="max-w-xl mx-auto my-20 text-center">
        <h1 className="text-6xl font-bold text-error mb-2">{status}</h1>
        <h2 className="text-2xl font-semibold mb-2">Oops!</h2>
        <p className="text-base-content/70 mb-6">{message}</p>
        <a href="/" className="btn btn-primary btn-sm">Go Back Home</a>
      </section>
    </main>
  );
}
