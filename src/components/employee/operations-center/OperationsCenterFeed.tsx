"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import type { EmployeeOperationsFeedItem, OperationsContentType } from "@/lib/operations-center/types";

function typeLabel(t: (key: string) => string, type: OperationsContentType): string {
  return t(`operationsCenter.types.${type}`);
}

export function OperationsCenterFeed() {
  const { t } = useI18n();
  const [items, setItems] = useState<EmployeeOperationsFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/operations-center", { credentials: "include" });
      if (res.ok) {
        const j = (await res.json()) as { items?: EmployeeOperationsFeedItem[] };
        setItems(j.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-zinc-500">{t("common.loading")}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{t("operationsCenter.employee.empty")}</p>;
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/employee/operations-center/${item.id}`}
            className="flex items-center gap-3 py-3 active:bg-zinc-50 dark:active:bg-zinc-800"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
                {item.is_pending ? (
                  <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                    {t("operationsCenter.employee.unreadBadge")}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-zinc-500">
                {typeLabel(t, item.content_type)} · {item.publish_date}
                {item.display_status === "upcoming"
                  ? ` · ${t("operationsCenter.displayStatus.upcoming")}`
                  : ""}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-violet-600">
              {t("operationsCenter.employee.open")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
