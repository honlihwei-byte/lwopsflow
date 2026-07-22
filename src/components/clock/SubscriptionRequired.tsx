type Props = {
  message: string;
  companyName?: string;
  statusLabel?: string;
};

export function SubscriptionRequired({ message, companyName, statusLabel }: Props) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 shadow-sm dark:border-amber-900 dark:bg-amber-950/40">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
          Subscription required
        </p>
        <h1 className="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          Clock unavailable
        </h1>
        {companyName ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {companyName}
            {statusLabel ? ` · ${statusLabel}` : ""}
          </p>
        ) : null}
        <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{message}</p>
      </div>
    </div>
  );
}
