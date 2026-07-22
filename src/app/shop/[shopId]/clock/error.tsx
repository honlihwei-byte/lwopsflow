"use client";

export default function ClockRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Could not load clock page</h1>
      <p className="text-sm text-red-600 dark:text-red-400">
        {error.message || "Something went wrong loading this page."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
      >
        Try again
      </button>
    </div>
  );
}
