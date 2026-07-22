import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { btnSecondary } from "@/components/marketing/marketing-buttons";

export const metadata: Metadata = {
  title: "Staff Clock In — Punch Card System",
  description: "How staff clock in and out using your shop QR code.",
};

export default function StaffClockHelpPage() {
  return (
    <MarketingShell narrow>
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Staff clock in / out</h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Staff do not sign in here. Open the <strong>QR code at your shop</strong> (printed or
          shared by your manager), then clock in or out on that page.
        </p>
        <ol className="mt-8 space-y-4 text-left text-sm text-zinc-700 dark:text-zinc-300">
          <li className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="font-bold text-emerald-600">1</span>
            Scan the shop QR with your phone camera or QR app.
          </li>
          <li className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="font-bold text-emerald-600">2</span>
            Allow location when prompted (GPS verification).
          </li>
          <li className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="font-bold text-emerald-600">3</span>
            Select your name and tap Clock In or Clock Out.
          </li>
        </ol>
        <p className="mt-6 text-xs text-zinc-500">
          Shop URLs stay the same — e.g. /shop/your-shop-id/clock or /clock/your-shop-id
        </p>
        <Link href="/" className={`${btnSecondary("mt-8")} w-full sm:w-auto`}>
          Back to home
        </Link>
      </div>
    </MarketingShell>
  );
}
