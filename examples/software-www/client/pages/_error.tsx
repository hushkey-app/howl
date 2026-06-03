import { useHead } from "@hushkey/howl-react/head";
import type { ReactPageProps } from "@hushkey/howl-react";

export default function Error(props: ReactPageProps) {
  const errorMap = {
    404: "Not Found",
    500: "Internal Server Error",
    403: "Forbidden",
    401: "Unauthorized",
    400: "Bad Request",
  };
  const status = (props.error as { status?: number })?.status ?? 500;
  const message = errorMap[status as keyof typeof errorMap] ?? "Unknown error";

  useHead({ title: `Error ${message}` });

  return (
    <div className="pt-20 pb-20 flex flex-1 justify-center px-5 bg-base-100">
      <div className="text-center w-full max-w-2xl">
        <h1 className="text-6xl sm:text-6xl font-bold mb-4 text-error">{status}</h1>
        <h2 className="text-3xl sm:text-3xl font-semibold mb-2">Oops!</h2>
        <p className="text-lg sm:text-lg mb-3 text-base-content/70">{message}</p>
        <p className="text-base mb-8 text-base-content/60 leading-relaxed">
          The page you're looking for could not be found.
        </p>
        <a href="/" className="btn btn-primary btn-md rounded-lg mt-4" client-nav="true">
          Go Back Home
        </a>
      </div>
    </div>
  );
}
