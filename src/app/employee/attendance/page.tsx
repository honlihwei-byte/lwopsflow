"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { EmployeePermissionGuard } from "@/components/employee/EmployeePermissionGuard";
import { punchActionChipClass, translatePunchAction } from "@/lib/i18n/attendance-ui";

type Row = {
  id: string;
  shop_name: string;
  event_date: string;
  event_time: string;
  action_type: string;
};

function EmployeeAttendanceInner() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employee/attendance", { credentials: "include" });
      if (res.ok) {
        const j = (await res.json()) as { attendance?: Row[] };
        setRows(j.attendance ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("employee.attendance.title")}</h1>
      {loading ? (
        <p className="text-sm text-zinc-500">{t("employee.attendance.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("employee.attendance.empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{r.shop_name}</p>
                <p className="text-xs text-zinc-500">
                  {r.event_date} {r.event_time}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${punchActionChipClass(
                  r.action_type,
                )}`}
              >
                {translatePunchAction(t, r.action_type)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EmployeeAttendancePage() {
  return (
    <EmployeeSessionGate>
      <EmployeePermissionGuard moduleId="my_attendance">
        <EmployeeAttendanceInner />
      </EmployeePermissionGuard>
    </EmployeeSessionGate>
  );
}
