"use client";

import { useEffect, useState } from "react";

type TrustedDevice = {
  id: string;
  device_id: string;
  device_name: string | null;
  browser_info: string | null;
  os_name: string | null;
  approved: boolean;
  first_seen_at: string;
  last_seen_at: string;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  });
}

export function StaffTrustedDevicesPanel({ staffId }: { staffId: string }) {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/staff/${staffId}/trusted-devices`, {
          credentials: "include",
        });
        const j = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(j.error || "Could not load devices");
          return;
        }
        if (!cancelled) setDevices(j.devices ?? []);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (loading) {
    return <p className="mt-2 text-sm text-zinc-500">Loading trusted devices…</p>;
  }
  if (error) {
    return <p className="mt-2 text-sm text-red-600">{error}</p>;
  }
  if (devices.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500">No registered devices yet.</p>;
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-zinc-50 text-left text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <th className="px-3 py-2 font-semibold">Device name</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Fingerprint</th>
            <th className="px-3 py-2 font-semibold">First seen</th>
            <th className="px-3 py-2 font-semibold">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                {d.device_name || d.os_name || "Unknown device"}
              </td>
              <td className="px-3 py-2">
                {d.approved ? (
                  <span className="text-emerald-700 dark:text-emerald-400">Trusted</span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">Review required</span>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-[10px]">{d.device_id.slice(0, 12)}…</td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatWhen(d.first_seen_at)}</td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatWhen(d.last_seen_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
