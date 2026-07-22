"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QrCodePanel } from "@/components/QrCodePanel";
import { ShopGpsLocationsPanel } from "@/components/ShopGpsLocationsPanel";
import { ShopLocationPicker, type ShopGpsForm } from "@/components/ShopLocationPicker";
import { IndoorConfidenceModeField } from "@/components/admin/IndoorConfidenceModeField";
import { PhotoProofFallbackField } from "@/components/admin/PhotoProofFallbackField";
import { buildClockPageUrl } from "@/lib/clock-routes";
import { ShopOperatingHoursFields, schedulingFromShop } from "@/components/admin/shops/ShopOperatingHoursFields";
import { ShopShiftTemplatesPanel } from "@/components/admin/shops/ShopShiftTemplatesPanel";
import { DeleteShopModal } from "@/components/admin/shops/DeleteShopModal";
import { ShopDetailTabBar, type ShopDetailTabId } from "@/components/admin/shops/ShopDetailTabBar";
import { ShopSecuritySettingsPanel } from "@/components/admin/shops/ShopSecuritySettingsPanel";
import { ShopStaffSchedulePanel } from "@/components/admin/shops/ShopStaffSchedulePanel";
import { ShopListRow, type ShopRowStats } from "@/components/admin/shops/ShopListRow";
import { ShopPhotoField } from "@/components/admin/shops/ShopPhotoField";
import { ShopsPageHero } from "@/components/admin/shops/ShopsPageHero";
import { ShopsBottomCta } from "@/components/admin/shops/ShopsBottomCta";
import { PageGuideOutlineButton } from "@/components/admin/shops/PageGuideOutlineButton";
import { PageGuide } from "@/components/help/PageGuide";
import { DEFAULT_SHOP_SCHEDULING, type ShopSchedulingFields } from "@/lib/shop-scheduling";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  dashboardCard,
  dashboardInput,
  dashboardPrimaryBtn,
} from "@/components/admin/report/dashboard-ui";
import { HelpInfoIcon } from "@/components/help/HelpInfoIcon";
import { useI18n } from "@/components/i18n/LanguageProvider";

export type ShopManagerVariant = "shops" | "schedule";

type ShopManagerProps = {
  variant?: ShopManagerVariant;
};

type Shop = {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  allowed_radius_meters?: number;
  gps_indoor_mode?: boolean;
  allow_photo_proof_fallback?: boolean;
  attendance_verification_mode?: string | null;
  punch_qr_token?: string | null;
  work_time_mode?: string;
  opening_time?: string | null;
  closing_time?: string | null;
  break_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
};

type ApiErrJson = {
  error?: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function formatApiError(j: ApiErrJson): string {
  const msg = j.error ?? j.message ?? "Request failed";
  const extra = [j.code && `code: ${j.code}`, j.details && `details: ${j.details}`, j.hint && `hint: ${j.hint}`]
    .filter(Boolean)
    .join("\n");
  return extra ? `${msg}\n${extra}` : msg;
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as ApiErrJson;
    return formatApiError(j);
  } catch {
    return text.trim() || `HTTP ${res.status}`;
  }
}

function gpsFromShop(s: Shop): ShopGpsForm {
  return {
    latitude: s.latitude != null ? String(s.latitude) : "",
    longitude: s.longitude != null ? String(s.longitude) : "",
    allowed_radius_meters: String(s.allowed_radius_meters ?? 50),
  };
}

function emptyGpsForm(): ShopGpsForm {
  return { latitude: "", longitude: "", allowed_radius_meters: "50" };
}

function gpsPayload(form: ShopGpsForm) {
  return {
    latitude: form.latitude.trim() === "" ? null : form.latitude.trim(),
    longitude: form.longitude.trim() === "" ? null : form.longitude.trim(),
    allowed_radius_meters: Number(form.allowed_radius_meters.trim() || "50"),
  };
}

export function ShopManager({ variant = "shops" }: ShopManagerProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const showSecurityNotice = searchParams.get("notice") === "security";
  const isSchedulePage = variant === "schedule";
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newGps, setNewGps] = useState<ShopGpsForm>(emptyGpsForm);
  const [newIndoorMode, setNewIndoorMode] = useState(false);
  const [newPhotoProof, setNewPhotoProof] = useState(false);
  const [newScheduling, setNewScheduling] = useState<ShopSchedulingFields>(DEFAULT_SHOP_SCHEDULING);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGps, setEditGps] = useState<ShopGpsForm>(emptyGpsForm);
  const [editIndoorMode, setEditIndoorMode] = useState(false);
  const [editPhotoProof, setEditPhotoProof] = useState(false);
  const [editScheduling, setEditScheduling] = useState<ShopSchedulingFields>(DEFAULT_SHOP_SCHEDULING);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null);
  const [shopStats, setShopStats] = useState<Record<string, ShopRowStats>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTab, setDetailTab] = useState<ShopDetailTabId>("general");

  useEffect(() => {
    setDetailTab(isSchedulePage ? "schedule" : "general");
  }, [expandedShopId, isSchedulePage]);

  const filteredShops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter((s) => s.name.toLowerCase().includes(q));
  }, [shops, searchQuery]);

  const headOfficeId = useMemo(() => {
    if (shops.length === 0) return null;
    const sorted = [...shops].sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    );
    return sorted[0]?.id ?? null;
  }, [shops]);

  const guidePageId = variant === "schedule" ? "shift-schedule" : "shops";
  const pageTitle =
    variant === "schedule" ? t("shops.scheduleTitle") : t("shops.title");
  const pageSubtitle =
    variant === "schedule" ? t("shops.scheduleSubtitle") : t("shops.subtitle");

  const loadShopStats = useCallback(async (shopIds: string[]) => {
    const today = malaysiaDateYmd(new Date());
    const entries = await Promise.all(
      shopIds.map(async (id) => {
        try {
          const [staffRes, schedRes] = await Promise.all([
            fetch(`/api/staff?shop_id=${encodeURIComponent(id)}`, { credentials: "include" }),
            fetch(
              `/api/shops/${encodeURIComponent(id)}/staff-schedule?from=${today}&to=${today}`,
              { credentials: "include" },
            ),
          ]);
          const staffJson = (await staffRes.json()) as { staff?: { status?: string }[] };
          const schedJson = (await schedRes.json()) as {
            rows?: { status?: string; is_off_day?: boolean }[];
          };
          const staff = staffJson.staff ?? [];
          const rows = schedJson.rows ?? [];
          const employeeCount = staff.filter((s) => s.status !== "inactive").length;
          const activeShiftsToday = rows.filter(
            (r) => r.status === "active" && !r.is_off_day,
          ).length;
          return [id, { employeeCount, activeShiftsToday }] as const;
        } catch {
          return [id, { employeeCount: 0, activeShiftsToday: 0 }] as const;
        }
      }),
    );
    setShopStats(Object.fromEntries(entries));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shops", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const j = (await res.json()) as { shops?: Shop[] };
      const list = (j.shops ?? []) as Shop[];
      setShops(list);
      if (list.length > 0) void loadShopStats(list.map((s) => s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.errors.failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, [loadShopStats]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function addShop() {
    const name = newName.trim();
    if (!name) {
      setError(t("shops.editForm.errors.nameRequired"));
      return;
    }
    setSavingId("__add__");
    setError(null);
    try {
      const res = await fetch("/api/shops", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...gpsPayload(newGps),
          gps_indoor_mode: newIndoorMode,
          allow_photo_proof_fallback: newPhotoProof,
          ...newScheduling,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      await res.json();
      setNewName("");
      setNewGps(emptyGpsForm());
      setNewIndoorMode(false);
      setNewPhotoProof(false);
      setNewScheduling(DEFAULT_SHOP_SCHEDULING);
      setShowAddPanel(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.errors.couldNotCreate"));
    } finally {
      setSavingId(null);
    }
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) {
      setError(t("shops.editForm.errors.nameRequired"));
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/shops/${id}`, {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...gpsPayload(editGps),
          gps_indoor_mode: editIndoorMode,
          allow_photo_proof_fallback: editPhotoProof,
          ...editScheduling,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      await res.json();
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.errors.couldNotSave"));
    } finally {
      setSavingId(null);
    }
  }

  async function regenerateQrToken(shopId: string) {
    if (
      !window.confirm(
        t("shops.detail.regenerateQrConfirm"),
      )
    ) {
      return;
    }
    setSavingId(shopId);
    setError(null);
    try {
      const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/qr-token`, {
        credentials: "include",
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; shop?: Shop };
      if (!res.ok) throw new Error(j.error || t("shops.editForm.errors.couldNotRegenerateQr"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.errors.couldNotRegenerateQr"));
    } finally {
      setSavingId(null);
    }
  }

  async function confirmPermanentDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setSavingId(id);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/shops/${id}`, {
        credentials: "include",
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setShops((prev) => prev.filter((s) => s.id !== id));
      if (editingId === id) setEditingId(null);
      setDeleteTarget(null);
      setSuccessMessage(t("shops.detail.shopDeleted"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("shops.editForm.errors.couldNotDelete"));
    } finally {
      setSavingId(null);
    }
  }

  if (loading && shops.length === 0) {
    return <div className="px-4 py-12 text-center text-zinc-500">{t("shops.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">{pageTitle}</h1>
          <p className="mt-1 text-sm text-[#64748B]">{pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PageGuideOutlineButton pageId={guidePageId} />
          <button
            type="button"
            onClick={() => setShowAddPanel(true)}
            className={`${dashboardPrimaryBtn} shrink-0`}
          >
            {t("shops.addNewShop")}
          </button>
        </div>
      </div>

      <ShopsPageHero />

      {showSecurityNotice && !isSchedulePage ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {t("shops.detail.securityNotice")}{" "}
          <strong>{t("shops.detail.securityNoticeTab")}</strong> {t("shops.detail.securityNoticeSuffix")}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
          {successMessage}
        </div>
      ) : null}

      {error ? (
        <div className="space-y-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">
          <pre className="whitespace-pre-wrap font-sans">{error}</pre>
          <p className="text-xs text-red-700/90">
            Check{" "}
            <code className="rounded bg-red-100 px-1">.env.local</code> (copy from{" "}
            <code className="rounded bg-red-100 px-1">.env.example</code>
            ): <code className="rounded bg-red-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-red-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code> must match
            the Supabase project where you ran <code className="rounded bg-red-100 px-1">schema.sql</code>.
            Restart <code className="rounded bg-red-100 px-1">next dev</code> after editing env.
          </p>
          <p className="text-xs">
            <Link
              href="/api/health/supabase"
              className="font-medium text-red-900 underline"
              target="_blank"
              rel="noreferrer"
            >
              Open Supabase connection diagnostic (JSON)
            </Link>
          </p>
        </div>
      ) : null}

      {showAddPanel ? (
        <section className={`${dashboardCard} p-6`}>
          <h2 className="mb-1 text-base font-semibold text-[#0F172A]">{t("shops.addNewShopShort")}</h2>
          <p className="mb-4 text-sm text-[#64748B]">{t("shops.addShopTip")}</p>
          <div className="flex flex-col gap-4">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-[#64748B]">
              {t("shops.shopName")}
              <input
                className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm shadow-sm"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("shops.shopNamePlaceholder")}
              />
            </label>
            <ShopLocationPicker
              form={newGps}
              onChange={setNewGps}
              shopName={newName}
              onShopNameSuggestion={setNewName}
            />
            <IndoorConfidenceModeField checked={newIndoorMode} onChange={setNewIndoorMode} />
            <PhotoProofFallbackField checked={newPhotoProof} onChange={setNewPhotoProof} />
            <ShopOperatingHoursFields value={newScheduling} onChange={setNewScheduling} />
            <button
              type="button"
              disabled={savingId === "__add__"}
              onClick={() => void addShop()}
              className={dashboardPrimaryBtn}
            >
              {savingId === "__add__" ? t("staff.saving") : t("shops.createShop")}
            </button>
          </div>
        </section>
      ) : null}

      {shops.length === 0 && !loading ? (
        <div className={`${dashboardCard} px-6 py-12 text-center`}>
          <p className="text-sm text-[#64748B]">{t("shops.noShopsYet")}</p>
          <button type="button" onClick={() => setShowAddPanel(true)} className={`${dashboardPrimaryBtn} mt-4`}>
            {t("shops.addNewShop")}
          </button>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#0F172A]">{t("shops.overview")}</h2>
              <p className="mt-0.5 text-sm text-[#64748B]">{t("shops.subtitle")}</p>
            </div>
            <label className="relative w-full sm:max-w-xs">
              <span className="sr-only">{t("shops.detail.searchSr")}</span>
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("shops.searchShops")}
                className={`${dashboardInput} pl-10`}
              />
            </label>
          </div>

          {searchQuery.trim() && filteredShops.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#64748B]">{t("shops.detail.noShopsMatch")}</p>
          ) : (
            <div className="space-y-3">
              {filteredShops.map((s) => {
                const stats = shopStats[s.id] ?? { employeeCount: 0, activeShiftsToday: 0 };
                const expanded = expandedShopId === s.id;
                return (
                  <ShopListRow
                    key={s.id}
                    shop={s}
                    stats={stats}
                    isHeadOffice={s.id === headOfficeId}
                    expanded={expanded}
                    scheduleMode={isSchedulePage}
                    onOpenSchedule={() => {
                      setExpandedShopId((curr) => {
                        const next = curr === s.id ? null : s.id;
                        if (next) {
                          requestAnimationFrame(() => {
                            document
                              .getElementById(`shop-detail-${s.id}`)
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        }
                        return next;
                      });
                    }}
                    onEdit={() => {
                      if (isSchedulePage) {
                        router.push("/admin/shops");
                        return;
                      }
                      setExpandedShopId(s.id);
                      setEditingId(s.id);
                      setEditName(s.name);
                      setEditGps(gpsFromShop(s));
                      setEditIndoorMode(s.gps_indoor_mode === true);
                      setEditPhotoProof(s.allow_photo_proof_fallback === true);
                      setEditScheduling(schedulingFromShop(s));
                      requestAnimationFrame(() => {
                        document
                          .getElementById(`shop-detail-${s.id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    }}
                    onDelete={() => {
                      if (isSchedulePage) return;
                      setDeleteTarget({ id: s.id, name: s.name });
                    }}
                  />
                );
              })}
            </div>
          )}

          <ShopsBottomCta onAddShop={() => setShowAddPanel(true)} />

          {isSchedulePage ? (
            <div className="pt-2">
              <PageGuide pageId="shift-schedule" />
            </div>
          ) : null}
        </section>
      )}

      <ul className="space-y-6">
        {shops.map((s) => {
          if (expandedShopId !== s.id) return null;
          const clockUrl = buildClockPageUrl(s.id, s.punch_qr_token ?? null);
          const hasGps = s.latitude != null && s.longitude != null;
          return (
            <li
              key={`detail-${s.id}`}
              id={`shop-detail-${s.id}`}
              className={`${dashboardCard} p-5 sm:p-6`}
            >
              {editingId === s.id ? (
                <div className="space-y-4">
                  <ShopPhotoField shopId={s.id} shopName={editName || s.name} />
                  <input
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <ShopLocationPicker
                    form={editGps}
                    onChange={setEditGps}
                    shopName={editName}
                    onShopNameSuggestion={setEditName}
                  />
                  <IndoorConfidenceModeField
                    checked={editIndoorMode}
                    onChange={setEditIndoorMode}
                    disabled={savingId === s.id}
                  />
                  <PhotoProofFallbackField
                    checked={editPhotoProof}
                    onChange={setEditPhotoProof}
                    disabled={savingId === s.id}
                  />
                  <ShopOperatingHoursFields
                    value={editScheduling}
                    onChange={setEditScheduling}
                    disabled={savingId === s.id}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingId === s.id}
                      onClick={() => void saveEdit(s.id)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                    >
                      {t("shops.detail.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                    >
                      {t("shops.detail.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-xl font-semibold text-[#0F172A]">{s.name}</h2>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDetailTab("general");
                          setEditingId(s.id);
                          setEditName(s.name);
                          setEditGps(gpsFromShop(s));
                          setEditIndoorMode(s.gps_indoor_mode === true);
                          setEditPhotoProof(s.allow_photo_proof_fallback === true);
                          setEditScheduling(schedulingFromShop(s));
                        }}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                      >
                        {t("shops.editShop")}
                      </button>
                      {!isSchedulePage ? (
                        <button
                          type="button"
                          disabled={savingId === s.id}
                          onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                        >
                          {t("shops.deleteShop")}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <ShopDetailTabBar active={detailTab} onChange={setDetailTab} />

                  {detailTab === "general" ? (
                    <div className="space-y-4">
                      <ShopPhotoField shopId={s.id} shopName={s.name} compact />
                      <p className="text-sm text-[#64748B]">{t("shops.detail.highRiseGpsTip")}</p>
                      {s.gps_indoor_mode ? (
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                          {t("shops.detail.indoorModeOn")}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500">{t("shops.detail.standardGps")}</p>
                      )}
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        {schedulingFromShop(s).work_time_mode === "fixed"
                          ? `${t("shops.detail.hoursLabel")} ${schedulingFromShop(s).opening_time}–${schedulingFromShop(s).closing_time}`
                          : t("shops.detail.shiftBasedHours")}
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        {hasGps ? (
                          <>
                            {t("shops.detail.gpsSet")} · {s.allowed_radius_meters ?? 50}{" "}
                            {t("shops.detail.meterRadius")}
                          </>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-300">
                            {t("shops.detail.gpsNotSet")}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {t("shops.detail.editShopHintBefore")}{" "}
                        <strong>{t("shops.editShop")}</strong> {t("shops.detail.editShopHintAfter")}
                      </p>
                    </div>
                  ) : null}

                  {detailTab === "qr" ? (
                    <div className="space-y-3">
                      <p className="text-sm text-[#64748B]">{t("shops.detail.qrPrintHint")}</p>
                      <p className="break-all text-xs text-zinc-500">{clockUrl}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center text-xs font-medium uppercase tracking-wide text-zinc-500">
                          {t("shops.detail.clockQr")}
                          <HelpInfoIcon helpKey="clockQr" />
                        </p>
                        <button
                          type="button"
                          disabled={savingId === s.id}
                          onClick={() => void regenerateQrToken(s.id)}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-semibold dark:border-zinc-600 disabled:opacity-50"
                        >
                          {savingId === s.id ? t("shops.detail.updating") : t("shops.detail.regenerateQr")}
                        </button>
                      </div>
                      {!s.punch_qr_token ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          {t("shops.detail.noQrYet")}
                        </p>
                      ) : null}
                      <QrCodePanel
                        shopName={s.name}
                        size={200}
                        value={clockUrl}
                      />
                    </div>
                  ) : null}

                  {detailTab === "gps" ? (
                    <div className="space-y-4">
                      <p className="text-sm text-[#64748B]">{t("shops.detail.gpsTabDesc")}</p>
                      <ShopGpsLocationsPanel shopId={s.id} shopName={s.name} hasMainShopGps={hasGps} />
                    </div>
                  ) : null}

                  {detailTab === "schedule" ? (
                    <div className="space-y-6">
                      {schedulingFromShop(s).work_time_mode === "shift_based" ? (
                        <ShopShiftTemplatesPanel shopId={s.id} />
                      ) : null}
                      <ShopStaffSchedulePanel
                        shopId={s.id}
                        shopName={s.name}
                        shops={shops.map((sh) => ({ id: sh.id, name: sh.name }))}
                        onShopChange={(id) => setExpandedShopId(id)}
                        workTimeMode={schedulingFromShop(s).work_time_mode}
                        shopHours={{
                          opening: schedulingFromShop(s).opening_time,
                          closing: schedulingFromShop(s).closing_time,
                          break_minutes: schedulingFromShop(s).break_minutes,
                        }}
                      />
                    </div>
                  ) : null}

                  {detailTab === "security" ? (
                    <div className="space-y-3">
                      <p className="text-sm text-[#64748B]">{t("shops.detail.securityTabIntro")}</p>
                      <ShopSecuritySettingsPanel shopId={s.id} disabled={savingId === s.id} />
                    </div>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>

      <DeleteShopModal
        open={deleteTarget != null}
        shopName={deleteTarget?.name ?? ""}
        busy={deleteTarget != null && savingId === deleteTarget.id}
        onCancel={() => {
          if (savingId !== deleteTarget?.id) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmPermanentDelete()}
      />
    </div>
  );
}
