import Link from "next/link";

type Props = {
  detail?: string;
};

export function InvalidQrFallback({ detail }: Props) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Invalid or outdated QR code
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {detail ??
            "This link does not match a valid shop clock page. Ask your manager to print a new QR from Admin → Shops."}
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Back to Home
      </Link>
    </main>
  );
}
