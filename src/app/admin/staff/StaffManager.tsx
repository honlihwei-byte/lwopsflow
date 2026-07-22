"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  displayStaffType,
  displayStatus,
} from "@/lib/i18n/display-values";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QrCodePanel } from "@/components/QrCodePanel";
import { HelpInfoIcon } from "@/components/help/HelpInfoIcon";
import { PageGuide } from "@/components/help/PageGuide";
import { StaffPermissionsPanel } from "@/components/admin/staff/StaffPermissionsPanel";
import { EmployeeAccountPanel } from "@/components/admin/staff/EmployeeAccountPanel";

type Shop = { id: string; name: string };

export type StaffRow = {
  id: string;
  staff_name: string;
  staff_code: string;
  staff_type: string;
  id_card_qr_value: string;
  status: "active" | "inactive";
  shop_ids: string[];
  shop_names: string[];
  created_at: string;
  updated_at: string;
  has_attendance: boolean;
  permission_summary?: {
    position_id: string | null;
    position_name: string | null;
    role_template: string;
    shop_scope: string;
    effective_permission_count: number;
    can_verify_tasks: boolean;
  } | null;
};

function ShopCheckboxes({
  shops,
  selected,
  onChange,
}: {
  shops: Shop[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <legend className="px-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
        {t("staff.assignedShops")} *
        <HelpInfoIcon helpKey="assignedShops" />
      </legend>
      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {shops.map((s) => {
          const checked = selected.has(s.id);
          return (
            <li key={s.id}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-zinc-300"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selected);
                    if (checked) next.delete(s.id);
                    else next.add(s.id);
                    onChange(next);
                  }}
                />
                <span>{s.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function StaffManager() {
  const { t } = useI18n();
  const [shops, setShops] = useState<Shop[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"full_time" | "part_time">("full_time");
  const [newShops, setNewShops] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"full_time" | "part_time">("full_time");
  const [editShops, setEditShops] = useState<Set<string>>(new Set());

  const loadShops = useCallback(async () => {
    const res = await fetch("/api/shops", { credentials: "include" });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Failed to load shops");
    setShops((j.shops ?? []) as Shop[]);
  }, []);

  const loadStaff = useCallback(async () => {
    const res = await fetch("/api/staff", { credentials: "include" });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Failed to load staff");
    setStaff((j.staff ?? []) as StaffRow[]);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadShops(), loadStaff()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [loadShops, loadStaff]);

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  async function addStaff() {
    const name = newName.trim();
    if (!name) {
      setError(t("staff.enterName"));
      return;
    }
    if (newShops.size === 0) {
      setError(t("staff.assignOneShop"));
      return;
    }
    setSavingId("__add__");
    setError(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_name: name,
          staff_type: newType,
          shop_ids: [...newShops],
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        const detail = j.details || j.code ? ` (${j.code ?? ""})` : "";
        throw new Error((j.error || "Could not add staff") + detail);
      }
      setNewName("");
      setNewType("full_time");
      setNewShops(new Set());
      await loadStaff();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add staff");
    } finally {
      setSavingId(null);
    }
  }

  function startEdit(s: StaffRow) {
    setEditingId(s.id);
    setEditName(s.staff_name);
    setEditType(s.staff_type === "part_time" ? "part_time" : "full_time");
    setEditShops(new Set(s.shop_ids));
    setError(null);
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) {
      setError(t("staff.nameEmpty"));
      return;
    }
    if (editShops.size === 0) {
      setError(t("staff.assignOneShop"));
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${id}`, {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_name: name,
          staff_type: editType,
          shop_ids: [...editShops],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not save");
      setEditingId(null);
      await loadStaff();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSavingId(null);
    }
  }

  async function setStatus(id: string, status: "active" | "inactive") {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${id}`, {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not update");
      await loadStaff();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    } finally {
      setSavingId(null);
    }
  }

  async function regenerateCard(id: string) {
    if (!window.confirm(t("staff.confirmNewQr"))) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${id}`, {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate_id_card: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not regenerate");
      await loadStaff();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setSavingId(null);
    }
  }

  async function removeStaff(id: string) {
    if (!window.confirm(t("staff.confirmDelete"))) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${id}`, {
        credentials: "include", method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not delete");
      await loadStaff();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setSavingId(null);
    }
  }

  if (loading && !shops.length && !staff.length) {
    return <div className="px-4 py-12 text-center text-zinc-500">{t("common.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin" className="text-sm font-medium text-blue-600 dark:text-blue-400">
          {t("staff.backAttendance")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{t("staff.title")}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("staff.subtitle")}</p>
          </div>
          <Link
            href="/admin/staff/new"
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {t("button.addEmployee")}
          </Link>
        </div>
      </div>

      <PageGuide pageId="staff" />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {shops.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">{t("staff.createShopFirst")}</p>
          <Link href="/admin/shops" className="mt-2 inline-block font-semibold text-amber-950 underline dark:text-amber-50">
            {t("staff.goToShops")}
          </Link>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("staff.addStaff")}</h2>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t("staff.name")} *
                  <input
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-900"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t("staff.fullName")}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t("staff.staffType")}
                  <select
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as "full_time" | "part_time")}
                  >
                    <option value="full_time">{t("attendance.fullTime")}</option>
                    <option value="part_time">{t("attendance.partTime")}</option>
                  </select>
                </label>
              </div>
              <ShopCheckboxes shops={shops} selected={newShops} onChange={setNewShops} />
              <button
                type="button"
                disabled={savingId === "__add__"}
                onClick={() => void addStaff()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingId === "__add__" ? t("staff.saving") : t("staff.addStaff")}
              </button>
            </div>
          </section>

          <ul className="space-y-6">
            {staff.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                {editingId === s.id ? (
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <select
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-900"
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as "full_time" | "part_time")}
                    >
                      <option value="full_time">{t("attendance.fullTime")}</option>
                      <option value="part_time">{t("attendance.partTime")}</option>
                    </select>
                    <ShopCheckboxes shops={shops} selected={editShops} onChange={setEditShops} />
                    <StaffPermissionsPanel staffId={s.id} shops={shops} />
                    <EmployeeAccountPanel staffId={s.id} />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingId === s.id}
                        onClick={() => void saveEdit(s.id)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                      >
                        {t("button.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                      >
                        {t("button.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{s.staff_name}</p>
                        <p className="text-xs text-zinc-500">
                          {t("staff.code")}: <span className="font-mono font-medium">{s.staff_code}</span> · {t("staff.type")}:{" "}
                          {displayStaffType(t, s.staff_type)} ·{" "}
                          <span
                            className={
                              s.status === "active"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-amber-700 dark:text-amber-300"
                            }
                          >
                            {displayStatus(t, s.status)}
                          </span>
                          {s.has_attendance ? ` · ${t("staff.hasAttendance")}` : ` · ${t("staff.noPunchesYet")}`}
                        </p>
                        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {s.shop_names.length > 0 ? (
                            <>
                              <span className="font-medium">
                                {t("staff.shopCount").replace("{count}", String(s.shop_names.length))}:
                              </span>{" "}
                              {s.shop_names.join(" · ")}
                            </>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-300">{t("staff.noShopsAssigned")}</span>
                          )}
                        </p>
                        {s.permission_summary ? (
                          <div className="mt-2 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                            <p>
                              <span className="font-medium">{t("positions.positionLabel")}:</span>{" "}
                              {s.permission_summary.position_name ?? "—"}
                            </p>
                            <p>
                              <span className="font-medium">{t("positions.systemRoleLabel")}:</span>{" "}
                              {t(`permissions.roles.${s.permission_summary.role_template}` as "permissions.roles.staff")}
                            </p>
                            <p>
                              <span className="font-medium">{t("positions.shopAccessLabel")}:</span>{" "}
                              {t(`permissions.scopes.${s.permission_summary.shop_scope}` as "permissions.scopes.assigned_only")}
                              {" · "}
                              <span className="font-medium">{t("positions.permissionsLabel")}:</span>{" "}
                              {t("positions.permissionsCount").replace(
                                "{count}",
                                String(s.permission_summary.effective_permission_count),
                              )}
                              {s.permission_summary.can_verify_tasks
                                ? ` · ${t("positions.canVerifyTasks")}`
                                : ""}
                            </p>
                          </div>
                        ) : null}
                        <p className="mt-1 break-all font-mono text-[11px] text-zinc-400">{s.id_card_qr_value}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                        >
                          {t("staff.edit")}
                        </button>
                        {s.status === "active" ? (
                          <button
                            type="button"
                            disabled={savingId === s.id}
                            onClick={() => void setStatus(s.id, "inactive")}
                            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                          >
                            {t("staff.deactivate")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={savingId === s.id}
                            onClick={() => void setStatus(s.id, "active")}
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                          >
                            {t("staff.activate")}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={savingId === s.id}
                          onClick={() => void regenerateCard(s.id)}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                        >
                          {t("staff.newCardQr")}
                        </button>
                        <button
                          type="button"
                          disabled={savingId === s.id || s.has_attendance}
                          title={s.has_attendance ? t("staff.deleteTitleInactive") : t("staff.delete")}
                          onClick={() => void removeStaff(s.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                        >
                          {t("staff.delete")}
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{t("staff.idCardQr")}</p>
                      <QrCodePanel
                        filenameBase={`id-card-${s.staff_code}`}
                        printTitle={`ID — ${s.staff_name}`}
                        size={180}
                        value={s.id_card_qr_value}
                      />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {staff.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">{t("staff.noStaffYet")}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
