"use client";

import { useEffect } from "react";

export function Toast({
  message,
  variant = "success",
  onDismiss,
  durationMs = 4000,
}: {
  message: string | null;
  variant?: "success" | "warning" | "error";
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [message, onDismiss, durationMs]);

  if (!message) return null;

  const styles =
    variant === "success"
      ? "border-emerald-200 bg-emerald-600 text-white shadow-lg dark:border-emerald-800"
      : variant === "warning"
        ? "border-amber-200 bg-amber-600 text-white shadow-lg dark:border-amber-900"
        : "border-red-200 bg-red-600 text-white shadow-lg dark:border-red-900";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 z-50 max-w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border px-4 py-3 text-center text-sm font-medium ${styles}`}
    >
      {message}
    </div>
  );
}

