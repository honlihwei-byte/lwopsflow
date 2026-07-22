import Link from "next/link";
import { GETTING_STARTED_SECTIONS } from "@/lib/help/getting-started";

export default function GettingStartedPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header>
        <Link href="/help" className="text-sm font-medium text-blue-600 underline dark:text-blue-400">
          ← Help Center
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Quick Start Guide
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Set up LW OpsFlow in order. Each step links to the right admin page.
        </p>
      </header>

      <ol className="space-y-6">
        {GETTING_STARTED_SECTIONS.map((section, index) => (
          <li
            key={section.id}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Step {index + 1}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {section.title}
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{section.body}</p>
            {section.href ? (
              <Link
                href={section.href}
                className="mt-3 inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {section.hrefLabel ?? "Continue"}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
