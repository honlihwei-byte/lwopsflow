import Link from "next/link";

export type HubLink = {
  href: string;
  title: string;
  description: string;
};

export function AdminHubLinks({ links }: { links: HubLink[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-blue-700"
          >
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{link.title}</h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{link.description}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
