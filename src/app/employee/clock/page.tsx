"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { EmployeeClockShopSelector } from "@/components/employee/EmployeeClockShopSelector";
import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { ClockScreenSkeleton } from "@/app/shop/[shopId]/clock/ClockScreenSkeleton";
import type { EmployeeClockContext } from "@/lib/employee-clock-context";
import type { EmployeeClockShopOption } from "@/lib/employee-clock-shop-access";
import { isValidShopId } from "@/lib/shop-id";

function OpeningClockSkeleton() {
  const { t } = useI18n();
  return <ClockScreenSkeleton message={t("employee.clock.opening")} />;
}

const ClockScreen = dynamic(
  () => import("@/app/shop/[shopId]/clock/ClockScreen").then((m) => ({ default: m.ClockScreen })),
  { ssr: false, loading: () => <OpeningClockSkeleton /> },
);

function blockMessageKey(message: string | null): string | null {
  if (!message) return null;
  if (message === "no_shop_assigned") return "employee.dashboard.noShopAssigned";
  if (message === "shop_not_accessible") return "employee.clock.shopNotAllowed";
  if (message === "no_schedule_today") return "employee.clock.noScheduleToday";
  return null;
}

function EmployeeClockInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlShopId = searchParams.get("shop_id") ?? "";

  const [context, setContext] = useState<EmployeeClockContext | null>(null);
  const [loading, setLoading] = useState(true);

  const loadContext = useCallback(async (shopId: string) => {
    setLoading(true);
    try {
      const qs = shopId ? `?shop_id=${encodeURIComponent(shopId)}` : "";
      const res = await fetch(`/api/employee/clock-context${qs}`, { credentials: "include" });
      if (!res.ok) return;
      const j = (await res.json()) as EmployeeClockContext;
      setContext(j);

      if (!shopId && j.suggested_shop_id && isValidShopId(j.suggested_shop_id)) {
        router.replace(`/employee/clock?shop_id=${encodeURIComponent(j.suggested_shop_id)}`);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadContext(urlShopId);
  }, [loadContext, urlShopId]);

  const formatShopLabel = useCallback(
    (shop: EmployeeClockShopOption) => {
      const tags: string[] = [];
      if (shop.scheduled_today) tags.push(t("employee.clock.labelScheduledToday"));
      if (shop.is_assigned) tags.push(t("employee.clock.labelAssigned"));
      if (shop.labels.includes("access_scope")) tags.push(t("employee.clock.labelAccessScope"));
      if (shop.has_open_session) tags.push(t("employee.clock.labelOpenSession"));
      const tag = tags[0];
      return tag ? `${shop.name} — ${tag}` : shop.name;
    },
    [t],
  );

  const selectedShop = useMemo(
    () => context?.accessible_shops.find((s) => s.id === urlShopId) ?? null,
    [context, urlShopId],
  );

  const pickClockOutHint = useMemo(() => {
    if (!context || context.open_sessions.length <= 1) return null;
    if (selectedShop?.has_open_session) return null;
    return t("employee.clock.selectShopClockOut");
  }, [context, selectedShop, t]);

  const showClockScreen = useMemo(() => {
    if (!context || !urlShopId || !isValidShopId(urlShopId) || !selectedShop) return false;
    if (context.block_message === "shop_not_accessible") return false;
    return selectedShop.can_clock_in || selectedShop.has_open_session;
  }, [context, urlShopId, selectedShop]);

  const pageBlockKey = blockMessageKey(context?.block_message ?? null);

  if (loading && !context) {
    return <ClockScreenSkeleton message={t("employee.dashboard.loading")} />;
  }

  if (context?.resolution === "none" && context.accessible_shops.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {t("employee.dashboard.noShopAssigned")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">{t("employee.clock.title")}</h1>

      {context ? (
        <EmployeeClockShopSelector
          shops={context.accessible_shops}
          selectedShopId={urlShopId}
          onSelect={(id) => router.push(`/employee/clock?shop_id=${encodeURIComponent(id)}`)}
          label={
            context.open_sessions.length > 1 && !selectedShop?.has_open_session
              ? t("employee.clock.selectShopClockOut")
              : t("employee.clock.selectShop")
          }
          pickClockOutHint={pickClockOutHint}
          formatShopLabel={formatShopLabel}
          disabled={loading}
        />
      ) : null}

      {pageBlockKey ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {t(pageBlockKey)}
        </p>
      ) : null}

      {!pageBlockKey && selectedShop && !selectedShop.can_clock_in && !selectedShop.has_open_session ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("employee.clock.noScheduleToday")}
        </p>
      ) : null}

      {showClockScreen ? (
        <ClockScreen
          key={urlShopId}
          shopId={urlShopId}
          punchQrToken={null}
          employeePortalMode
        />
      ) : loading ? (
        <ClockScreenSkeleton message={t("employee.dashboard.loading")} />
      ) : null}
    </div>
  );
}

export default function EmployeeClockPage() {
  return (
    <EmployeeSessionGate>
      <Suspense fallback={<OpeningClockSkeleton />}>
        <EmployeeClockInner />
      </Suspense>
    </EmployeeSessionGate>
  );
}
