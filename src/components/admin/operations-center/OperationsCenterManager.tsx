"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { Toast } from "@/components/Toast";
import { useAdminToast } from "@/components/admin/useAdminToast";
import { TaskShopMultiSelect } from "@/components/admin/tasks/TaskShopMultiSelect";
import { dashboardCard, dashboardPrimaryBtn } from "@/components/admin/report/dashboard-ui";
import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  OPERATIONS_CONTENT_TYPES,
  OPERATIONS_DISPLAY_STATUSES,
  OPERATIONS_STATUSES,
  type OperationsContentDetail,
  type OperationsContentListItem,
  type OperationsContentType,
  type OperationsDashboardStats,
  type OperationsDisplayStatus,
  type OperationsStatus,
} from "@/lib/operations-center/types";

type Shop = { id: string; name: string };
type TabId = "dashboard" | "library" | "create";

type FormState = {
  title: string;
  description: string;
  content_type: OperationsContentType;
  target_all_shops: boolean;
  shop_ids: string[];
  require_acknowledgement: boolean;
  require_task_completion: boolean;
  require_photo_proof: boolean;
  publish_date: string;
  effective_date: string;
  end_date: string;
  status: OperationsStatus;
};

async function readErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function displayStatusBadgeClass(status: OperationsDisplayStatus): string {
  switch (status) {
    case "draft":
      return "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100";
    case "published":
      return "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200";
    case "upcoming":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200";
    case "active":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
    case "ended":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "archived":
      return "bg-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function isDocMime(mime: string): boolean {
  return mime.includes("word") || mime === "application/msword";
}

function isSpreadsheetMime(mime: string): boolean {
  return mime.includes("spreadsheetml");
}

function emptyForm(today: string): FormState {
  return {
    title: "",
    description: "",
    content_type: "announcement",
    target_all_shops: false,
    shop_ids: [],
    require_acknowledgement: false,
    require_task_completion: false,
    require_photo_proof: false,
    publish_date: today,
    effective_date: today,
    end_date: "",
    status: "draft",
  };
}

const UPLOAD_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function OperationsCenterManager() {
  const { t } = useI18n();
  const { toast, showSuccess, showError, dismiss } = useAdminToast();
  const today = malaysiaDateYmd(new Date());

  const typeLabel = (type: OperationsContentType) => t(`operationsCenter.types.${type}`);
  const workflowStatusLabel = (status: OperationsStatus) => t(`operationsCenter.status.${status}`);
  const displayStatusLabel = (status: OperationsDisplayStatus) =>
    t(`operationsCenter.displayStatus.${status}`);

  const [tab, setTab] = useState<TabId>("dashboard");
  const [shops, setShops] = useState<Shop[]>([]);
  const [items, setItems] = useState<OperationsContentListItem[]>([]);
  const [stats, setStats] = useState<OperationsDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterShop, setFilterShop] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDisplayStatus, setFilterDisplayStatus] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailFull, setDetailFull] = useState<OperationsContentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadContentId, setUploadContentId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(today));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ include_shops: "true" });
      if (filterShop) qs.set("shop_id", filterShop);
      if (filterType) qs.set("content_type", filterType);
      if (filterStatus) qs.set("status", filterStatus);

      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/admin/operations-center?${qs}`, { credentials: "include" }),
        fetch(
          `/api/admin/operations-center/stats?${new URLSearchParams({
            ...(filterShop ? { shop_id: filterShop } : {}),
            ...(filterType ? { content_type: filterType } : {}),
            status: "published",
          })}`,
          { credentials: "include" },
        ),
      ]);

      if (listRes.ok) {
        const j = (await listRes.json()) as { items?: OperationsContentListItem[]; shops?: Shop[] };
        setItems(j.items ?? []);
        if (j.shops) setShops(j.shops);
      }
      if (statsRes.ok) {
        const j = (await statsRes.json()) as { stats?: OperationsDashboardStats };
        setStats(j.stats ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [filterShop, filterType, filterStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detailId) {
      setDetailFull(null);
      return;
    }
    setDetailLoading(true);
    void fetch(`/api/admin/operations-center/${detailId}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const j = (await res.json()) as { item?: OperationsContentDetail };
        setDetailFull(j.item ?? null);
      })
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  const libraryItems = useMemo(() => {
    let list = items;
    if (filterDisplayStatus) {
      list = list.filter((item) => item.display_status === filterDisplayStatus);
    }
    const published = items.filter((item) => item.status === "published");
    const byId = new Map(list.map((item) => [item.id, item]));
    for (const item of published) byId.set(item.id, item);
    return [...byId.values()].sort((a, b) => {
      if (a.publish_date !== b.publish_date) return b.publish_date.localeCompare(a.publish_date);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [items, filterDisplayStatus]);

  const detail = useMemo(
    () => detailFull ?? items.find((i) => i.id === detailId) ?? null,
    [detailFull, items, detailId],
  );

  function resetForm() {
    setForm(emptyForm(today));
    setEditingId(null);
    setUploadContentId(null);
  }

  function startEdit(item: OperationsContentListItem | OperationsContentDetail) {
    setForm({
      title: item.title,
      description: item.description,
      content_type: item.content_type,
      target_all_shops: item.target_all_shops,
      shop_ids: item.shop_ids,
      require_acknowledgement: item.require_acknowledgement,
      require_task_completion: item.require_task_completion,
      require_photo_proof: item.require_photo_proof,
      publish_date: item.publish_date,
      effective_date: item.effective_date,
      end_date: item.end_date ?? "",
      status: item.status,
    });
    setEditingId(item.id);
    setUploadContentId(item.id);
    setDetailId(null);
    setTab("create");
  }

  async function submitContent(publishNow: boolean) {
    if (!form.title.trim() || !form.publish_date.trim() || !form.effective_date.trim()) {
      showError(t("operationsCenter.form.title"));
      return;
    }
    if (!form.target_all_shops && form.shop_ids.length === 0) {
      showError(t("tasks.form.noShopsSelected"));
      return;
    }

    setCreating(true);
    try {
      const payload = {
        ...form,
        status: publishNow ? "published" : editingId ? form.status : "draft",
        end_date: form.end_date || null,
      };

      const res = editingId
        ? await fetch(`/api/admin/operations-center/${editingId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/operations-center", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) throw new Error(await readErr(res));
      const j = (await res.json()) as { item?: { id: string } };
      const contentId = j.item?.id ?? editingId;
      if (contentId) setUploadContentId(contentId);

      if (editingId) {
        showSuccess(t("operationsCenter.form.updated"));
        setTab("library");
        setFilterDisplayStatus("");
        setFilterStatus("");
        resetForm();
      } else if (publishNow) {
        showSuccess(t("operationsCenter.form.published"));
        setTab("library");
        setFilterDisplayStatus("");
        setFilterStatus("");
        resetForm();
      } else {
        showSuccess(t("operationsCenter.form.created"));
        if (contentId) setUploadContentId(contentId);
      }

      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  }

  async function uploadFile(file: File, contentId: string) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("content_id", contentId);
      fd.set("file", file);
      const res = await fetch("/api/admin/operations-center/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error(await readErr(res));
      showSuccess(t("operationsCenter.form.uploadFile"));
      await load();
      if (detailId === contentId) {
        const dRes = await fetch(`/api/admin/operations-center/${contentId}`, { credentials: "include" });
        if (dRes.ok) {
          const j = (await dRes.json()) as { item?: OperationsContentDetail };
          setDetailFull(j.item ?? null);
        }
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : t("operationsCenter.form.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function patchStatus(id: string, status: OperationsStatus, successKey: string) {
    const res = await fetch(`/api/admin/operations-center/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      showError(await readErr(res));
      return;
    }
    showSuccess(t(successKey));
    setDetailId(null);
    await load();
  }

  async function deleteContent(id: string) {
    const res = await fetch(`/api/admin/operations-center/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      showError(await readErr(res));
      return;
    }
    showSuccess(t("operationsCenter.detail.deletedPermanent"));
    setDetailId(null);
    await load();
  }

  const statCards = [
    { label: t("operationsCenter.stats.totalPublished"), value: stats?.total_published ?? 0 },
    { label: t("operationsCenter.stats.totalRecipients"), value: stats?.total_recipients ?? 0 },
    { label: t("operationsCenter.stats.readCount"), value: stats?.read_count ?? 0 },
    { label: t("operationsCenter.stats.acknowledgedCount"), value: stats?.acknowledged_count ?? 0 },
    { label: t("operationsCenter.stats.pendingCount"), value: stats?.pending_count ?? 0 },
    {
      label: t("operationsCenter.stats.readRate"),
      value: `${stats?.read_rate_pct ?? 0}%`,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{t("operationsCenter.title")}</h1>
        <p className="text-sm text-zinc-500">{t("operationsCenter.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["dashboard", "library", "create"] as TabId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              if (id === "create" && !editingId) resetForm();
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              tab === id
                ? "bg-violet-600 text-white"
                : "border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900"
            }`}
          >
            {id === "dashboard"
              ? t("nav.dashboard")
              : id === "library"
                ? t("operationsCenter.library.title")
                : editingId
                  ? t("operationsCenter.form.editTitle")
                  : t("operationsCenter.form.createTitle")}
          </button>
        ))}
      </div>

      {tab !== "create" ? (
        <div className="flex flex-wrap gap-2">
          <select
            value={filterShop}
            onChange={(e) => setFilterShop(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="">{t("operationsCenter.filters.allShops")}</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="">{t("operationsCenter.filters.allTypes")}</option>
            {OPERATIONS_CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="">{t("operationsCenter.filters.allStatuses")}</option>
            {OPERATIONS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {workflowStatusLabel(s)}
              </option>
            ))}
          </select>
          {tab === "library" ? (
            <select
              value={filterDisplayStatus}
              onChange={(e) => setFilterDisplayStatus(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            >
              <option value="">{t("operationsCenter.displayStatus.all")}</option>
              {OPERATIONS_DISPLAY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {displayStatusLabel(s)}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold"
          >
            {t("button.refresh")}
          </button>
        </div>
      ) : null}

      {tab === "dashboard" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {statCards.map((card) => (
            <div key={card.label} className={dashboardCard}>
              <p className="text-xs font-medium text-zinc-500">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "library" ? (
        <div className={`${dashboardCard} overflow-x-auto`}>
          {loading ? (
            <p className="text-sm text-zinc-500">{t("common.loading")}</p>
          ) : libraryItems.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("operationsCenter.list.empty")}</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                  <th className="py-2 pr-3">{t("operationsCenter.library.columns.title")}</th>
                  <th className="py-2 pr-3">{t("operationsCenter.library.columns.type")}</th>
                  <th className="py-2 pr-3">{t("operationsCenter.library.columns.targets")}</th>
                  <th className="py-2 pr-3">{t("operationsCenter.library.columns.publishDate")}</th>
                  <th className="py-2 pr-3">{t("operationsCenter.library.columns.effectiveDate")}</th>
                  <th className="py-2">{t("operationsCenter.library.columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {libraryItems.map((item) => (
                  <tr
                    key={item.id}
                    className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    onClick={() => setDetailId(item.id)}
                  >
                    <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-50">{item.title}</td>
                    <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">{typeLabel(item.content_type)}</td>
                    <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">
                      {item.target_all_shops
                        ? t("operationsCenter.form.targetAllShops")
                        : item.shop_names.join(", ")}
                    </td>
                    <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">{item.publish_date}</td>
                    <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">{item.effective_date}</td>
                    <td className="py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${displayStatusBadgeClass(item.display_status)}`}
                      >
                        {displayStatusLabel(item.display_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {tab === "create" ? (
        <div className={`${dashboardCard} space-y-3`}>
          <h2 className="font-semibold">
            {editingId ? t("operationsCenter.form.editTitle") : t("operationsCenter.form.createTitle")}
          </h2>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t("operationsCenter.form.title")}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t("operationsCenter.form.description")}
            rows={4}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          />
          <select
            value={form.content_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, content_type: e.target.value as OperationsContentType }))
            }
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          >
            {OPERATIONS_CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.target_all_shops}
              onChange={(e) => setForm((f) => ({ ...f, target_all_shops: e.target.checked }))}
            />
            {t("operationsCenter.form.targetAllShops")}
          </label>

          {!form.target_all_shops ? (
            <div>
              <p className="mb-1 text-sm font-medium">{t("operationsCenter.form.selectedShops")}</p>
              <TaskShopMultiSelect
                shops={shops}
                selectedIds={form.shop_ids}
                onChange={(shop_ids) => setForm((f) => ({ ...f, shop_ids }))}
              />
            </div>
          ) : null}

          {(
            [
              ["require_acknowledgement", "requireAck", "requireAckHint"],
              ["require_task_completion", "requireTask", "requireTaskHint"],
              ["require_photo_proof", "requirePhoto", "requirePhotoHint"],
            ] as const
          ).map(([key, labelKey, hintKey]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
              />
              <span>
                {t(`operationsCenter.form.${labelKey}`)}
                <span className="block text-xs text-zinc-500">
                  {t(`operationsCenter.form.${hintKey}`)}
                </span>
              </span>
            </label>
          ))}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-sm">
              {t("operationsCenter.form.publishDate")}
              <input
                type="date"
                required
                value={form.publish_date}
                onChange={(e) => setForm((f) => ({ ...f, publish_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>
            <label className="text-sm">
              {t("operationsCenter.form.effectiveDate")}
              <input
                type="date"
                required
                value={form.effective_date}
                onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>
            <label className="text-sm">
              {t("operationsCenter.form.endDate")}
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950"
              />
            </label>
          </div>

          {uploadContentId ? (
            <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50 p-3 dark:border-violet-700 dark:bg-violet-950/30">
              <p className="text-sm font-medium">{t("operationsCenter.form.attachments")}</p>
              <p className="text-xs text-zinc-500">{t("operationsCenter.form.uploadHint")}</p>
              <input
                type="file"
                accept={UPLOAD_ACCEPT}
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && uploadContentId) void uploadFile(file, uploadContentId);
                }}
                className="mt-2 block w-full text-sm"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {editingId ? (
              <>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void submitContent(false)}
                  className={dashboardPrimaryBtn}
                >
                  {creating ? t("operationsCenter.form.saving") : t("operationsCenter.form.saveChanges")}
                </button>
                {form.status === "draft" ? (
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => void submitContent(true)}
                    className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900"
                  >
                    {creating ? t("operationsCenter.form.saving") : t("operationsCenter.form.publish")}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void submitContent(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold"
                >
                  {creating ? t("operationsCenter.form.saving") : t("operationsCenter.form.saveDraft")}
                </button>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void submitContent(true)}
                  className={dashboardPrimaryBtn}
                >
                  {creating ? t("operationsCenter.form.saving") : t("operationsCenter.form.publish")}
                </button>
              </>
            )}
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setTab("library");
                }}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold"
              >
                {t("button.cancel")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className={`${dashboardCard} space-y-3`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{detail.title}</h3>
              <p className="text-xs text-zinc-500">
                {typeLabel(detail.content_type)} ·{" "}
                {detail.shop_names.join(", ") || t("operationsCenter.form.targetAllShops")} ·{" "}
                {t("operationsCenter.list.publishDate")} {detail.publish_date} ·{" "}
                {t("operationsCenter.list.effectiveDate")} {detail.effective_date}
                {detail.end_date ? ` · ${t("operationsCenter.list.endDate")} ${detail.end_date}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${displayStatusBadgeClass(detail.display_status)}`}
                >
                  {displayStatusLabel(detail.display_status)}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {workflowStatusLabel(detail.status)}
                </span>
              </div>
            </div>
            <button type="button" onClick={() => setDetailId(null)} className="text-sm text-zinc-500">
              {t("button.cancel")}
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">{detail.description}</p>

          {"attachments" in detail && detail.attachments && detail.attachments.length > 0 ? (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">{t("operationsCenter.form.attachments")}</h4>
              {detail.attachments.map((a) => {
                if (a.mime_type === "application/pdf" && a.preview_url) {
                  return (
                    <iframe
                      key={a.id}
                      title={a.file_name}
                      src={a.preview_url}
                      className="h-64 w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
                    />
                  );
                }
                if (a.mime_type.startsWith("image/") && a.preview_url) {
                  return (
                    <img
                      key={a.id}
                      src={a.preview_url}
                      alt={a.file_name}
                      className="max-h-64 w-full rounded-lg border border-zinc-200 object-contain dark:border-zinc-700"
                    />
                  );
                }
                if ((isDocMime(a.mime_type) || isSpreadsheetMime(a.mime_type)) && a.download_url) {
                  return (
                    <a
                      key={a.id}
                      href={a.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm font-semibold text-violet-700 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      {a.file_name}
                    </a>
                  );
                }
                return null;
              })}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
              <p className="text-zinc-500">{t("operationsCenter.stats.totalRecipients")}</p>
              <p className="text-lg font-bold">{detail.total_recipients}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
              <p className="text-zinc-500">{t("operationsCenter.stats.readCount")}</p>
              <p className="text-lg font-bold">{detail.read_count}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
              <p className="text-zinc-500">{t("operationsCenter.stats.acknowledgedCount")}</p>
              <p className="text-lg font-bold">{detail.acknowledged_count}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
              <p className="text-zinc-500">{t("operationsCenter.stats.pendingCount")}</p>
              <p className="text-lg font-bold">{detail.pending_count}</p>
            </div>
          </div>

          {"read_tracking" in detail && detail.read_tracking && detail.read_tracking.length > 0 ? (
            <div className="overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold">{t("operationsCenter.detail.trackingTitle")}</h4>
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-2 pr-3">{t("operationsCenter.detail.staff")}</th>
                    <th className="py-2 pr-3">{t("operationsCenter.detail.readAt")}</th>
                    <th className="py-2 pr-3">{t("operationsCenter.detail.ackAt")}</th>
                    <th className="py-2 pr-3">{t("operationsCenter.detail.taskAt")}</th>
                    <th className="py-2">{t("operationsCenter.detail.photoAt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.read_tracking.map((row) => (
                    <tr key={row.staff_id} className="border-b border-zinc-100">
                      <td className="py-2 pr-3">
                        {row.staff_name}
                        <span className="block text-zinc-400">{row.staff_code}</span>
                      </td>
                      <td className="py-2 pr-3">{fmtTime(row.first_viewed_at)}</td>
                      <td className="py-2 pr-3">{fmtTime(row.acknowledged_at)}</td>
                      <td className="py-2 pr-3">{fmtTime(row.task_completed_at)}</td>
                      <td className="py-2">
                        {row.photo_proof_url ? (
                          <a
                            href={row.photo_proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-violet-600"
                          >
                            {fmtTime(row.photo_proof_uploaded_at)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : detailLoading ? (
            <p className="text-sm text-zinc-500">{t("common.loading")}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startEdit(detail)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold"
            >
              {t("operationsCenter.detail.edit")}
            </button>
            {detail.status === "published" ? (
              <button
                type="button"
                onClick={() => void patchStatus(detail.id, "draft", "operationsCenter.detail.unpublished")}
                className="rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-800"
              >
                {t("operationsCenter.detail.unpublish")}
              </button>
            ) : null}
            {detail.status !== "archived" ? (
              <button
                type="button"
                onClick={() => void patchStatus(detail.id, "archived", "operationsCenter.detail.deleted")}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold"
              >
                {t("operationsCenter.detail.delete")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void deleteContent(detail.id)}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"
            >
              {t("operationsCenter.detail.deletePermanent")}
            </button>
          </div>
        </div>
      ) : null}

      <Toast message={toast?.message ?? null} variant={toast?.variant} onDismiss={dismiss} />
    </div>
  );
}
