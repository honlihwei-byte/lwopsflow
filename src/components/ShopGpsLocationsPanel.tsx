"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";
import { ShopLocationPicker, type ShopGpsForm } from "@/components/ShopLocationPicker";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { GPS_LOCATIONS_TABLE_MISSING_MSG, readApiError } from "@/lib/api-error";
import {
  displayGpsLocationType,
  displaySystemGpsLocationName,
} from "@/lib/i18n/display-values";
import { SHOP_GPS_LOCATION_TYPES, type ShopGpsLocationRow } from "@/lib/shop-gps-locations";
import type { ShopGpsLocationType } from "@/lib/gps-shop-verify";

type LocationForm = {
  name: string;
  location_type: ShopGpsLocationType;
  is_active: boolean;
  gps: ShopGpsForm;
};

function emptyForm(): LocationForm {
  return {
    name: "",
    location_type: "office",
    is_active: true,
    gps: { latitude: "", longitude: "", allowed_radius_meters: "50" },
  };
}

function formFromRow(row: ShopGpsLocationRow): LocationForm {
  return {
    name: row.name,
    location_type: row.location_type,
    is_active: row.is_active,
    gps: {
      latitude: String(row.latitude),
      longitude: String(row.longitude),
      allowed_radius_meters: String(row.allowed_radius_meters),
    },
  };
}

function payloadFromForm(form: LocationForm) {
  return {
    name: form.name.trim(),
    location_type: form.location_type,
    is_active: form.is_active,
    latitude: form.gps.latitude.trim(),
    longitude: form.gps.longitude.trim(),
    allowed_radius_meters: Number(form.gps.allowed_radius_meters.trim() || "50"),
  };
}

type Props = {
  shopId: string;
  shopName: string;
  /** Main shop GPS is configured (from shop edit). */
  hasMainShopGps: boolean;
};

export function ShopGpsLocationsPanel({ shopId, shopName, hasMainShopGps }: Props) {
  const { t } = useI18n();
  const [locations, setLocations] = useState<ShopGpsLocationRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<LocationForm>(emptyForm);
  const formErrorRef = useRef<HTMLParagraphElement>(null);

  const handleGpsChange = useCallback((gps: ShopGpsForm) => {
    setForm((f) => ({ ...f, gps }));
  }, []);

  const load = useCallback(
    async (opts?: { refreshOnly?: boolean }) => {
      const refreshOnly = opts?.refreshOnly === true;
      if (refreshOnly) {
        setListRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      try {
        const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/locations`);
        const j = (await res.json().catch(() => ({}))) as {
          locations?: ShopGpsLocationRow[];
          tableMissing?: boolean;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(j.error ?? `Failed to load locations (HTTP ${res.status})`);
        }
        setTableMissing(j.tableMissing === true);
        setLocations(j.locations ?? []);
        if (j.tableMissing && j.error) {
          setToast({ message: j.error, variant: "error" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load locations";
        console.error("[ShopGpsLocationsPanel] load failed", e);
        setToast({ message: msg, variant: "error" });
      } finally {
        setInitialLoading(false);
        setListRefreshing(false);
      }
    },
    [shopId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function startAdd() {
    setFormError(null);
    setEditingId(null);
    setShowAdd(true);
    setForm(emptyForm());
  }

  function startEdit(row: ShopGpsLocationRow) {
    setFormError(null);
    setShowAdd(false);
    setEditingId(row.id);
    setForm(formFromRow(row));
  }

  function cancelForm() {
    setFormError(null);
    setEditingId(null);
    setShowAdd(false);
    setForm(emptyForm());
  }

  function showFormError(message: string) {
    setFormError(message);
    setToast({ message, variant: "error" });
    console.error("[ShopGpsLocationsPanel] save validation:", message);
    window.setTimeout(() => {
      formErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }

  async function saveForm() {
    setFormError(null);

    if (!form.name.trim()) {
      showFormError("Location name is required (e.g. Office 12F).");
      return;
    }
    if (!form.gps.latitude.trim() || !form.gps.longitude.trim()) {
      showFormError("Set latitude and longitude — search a place, use current location, or type coordinates.");
      return;
    }

    const lat = Number(form.gps.latitude.trim());
    const lng = Number(form.gps.longitude.trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showFormError("Latitude and longitude must be valid numbers.");
      return;
    }

    setSaving(true);
    try {
      const body = payloadFromForm(form);
      const url =
        editingId != null
          ? `/api/shops/${encodeURIComponent(shopId)}/locations/${encodeURIComponent(editingId)}`
          : `/api/shops/${encodeURIComponent(shopId)}/locations`;

      console.log("[ShopGpsLocationsPanel] saving location", { shopId, editingId, body });

      const res = await fetch(url, {
        method: editingId != null ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await readApiError(res);
        console.error("[ShopGpsLocationsPanel] save failed", res.status, errText);
        showFormError(errText);
        return;
      }

      const j = (await res.json()) as { location?: ShopGpsLocationRow };
      console.log("[ShopGpsLocationsPanel] save success", j.location?.id);

      setToast({
        message: editingId ? "GPS location updated." : "GPS location saved.",
        variant: "success",
      });
      cancelForm();
      await load({ refreshOnly: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save location";
      console.error("[ShopGpsLocationsPanel] save error", e);
      showFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function removeLocation(id: string, name: string) {
    if (!window.confirm(`Remove GPS point "${name}"?`)) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/shops/${encodeURIComponent(shopId)}/locations/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      if (editingId === id) cancelForm();
      setToast({ message: t("shops.detail.gpsPanel.locationRemoved"), variant: "success" });
      await load({ refreshOnly: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not remove";
      console.error("[ShopGpsLocationsPanel] delete failed", e);
      setToast({ message: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const formOpen = showAdd || editingId != null;

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? "success"}
        onDismiss={() => setToast(null)}
      />

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {t("shops.detail.gpsPanel.extraGpsTitle")}
        </p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t("shops.detail.highRiseGpsTip")}</p>
        {!hasMainShopGps ? (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            {t("shops.detail.gpsPanel.mainGpsFirst")}
          </p>
        ) : null}
      </div>

      {tableMissing ? (
        <p className="rounded-lg bg-amber-50 px-2 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {GPS_LOCATIONS_TABLE_MISSING_MSG}
        </p>
      ) : null}

      {initialLoading ? (
        <p className="text-xs text-zinc-500">{t("shops.detail.gpsPanel.loadingExtra")}</p>
      ) : (
        <>
          {listRefreshing ? (
            <p className="text-xs text-zinc-500">{t("shops.detail.gpsPanel.refreshingList")}</p>
          ) : null}
          {locations.length === 0 ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {t("shops.detail.gpsPanel.noExtraPoints")}
              {hasMainShopGps ? "" : t("shops.detail.gpsPanel.noExtraPointsUntilSet")}
            </p>
          ) : (
            <ul className="space-y-2">
              {locations.map((loc) => (
                <li
                  key={loc.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {displaySystemGpsLocationName(t, loc.name)}
                        {!loc.is_active ? (
                          <span className="ml-2 font-normal text-zinc-500">
                            {t("shops.detail.gpsPanel.inactive")}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                        {displayGpsLocationType(t, loc.location_type)} · {loc.latitude.toFixed(5)},{" "}
                        {loc.longitude.toFixed(5)} · {loc.allowed_radius_meters} m
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={saving || tableMissing}
                        onClick={() => startEdit(loc)}
                        className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 disabled:opacity-50"
                      >
                        {t("shops.edit")}
                      </button>
                      <button
                        type="button"
                        disabled={saving || tableMissing}
                        onClick={() => void removeLocation(loc.id, loc.name)}
                        className="rounded border border-red-200 px-2 py-1 text-red-800 dark:border-red-900 dark:text-red-200 disabled:opacity-50"
                      >
                        {t("shops.detail.gpsPanel.gpsRemove")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {formOpen ? (
        <form
          className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/30"
          onSubmit={(e) => {
            e.preventDefault();
            void saveForm();
          }}
        >
          <p className="mb-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {editingId
              ? t("shops.detail.gpsPanel.editExtraLocation")
              : t("shops.detail.gpsPanel.addExtraLocation")}
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("shops.detail.gpsPanel.nameLabel")}
              <input
                className="rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("shops.detail.gpsPanel.namePlaceholder")}
                disabled={saving}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("shops.detail.gpsPanel.typeLabel")}
              <select
                className="rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900"
                value={form.location_type}
                disabled={saving}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    location_type: e.target.value as ShopGpsLocationType,
                  }))
                }
              >
                {SHOP_GPS_LOCATION_TYPES.map((typeKey) => (
                  <option key={typeKey} value={typeKey}>
                    {displayGpsLocationType(t, typeKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={form.is_active}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              {t("shops.detail.gpsPanel.activeForClock")}
            </label>
            <ShopLocationPicker
              form={form.gps}
              onChange={handleGpsChange}
              shopName={shopName}
            />

            {formError ? (
              <p
                ref={formErrorRef}
                className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {formError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || tableMissing}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? t("shops.detail.gpsPanel.savingLocation") : t("shops.detail.gpsPanel.saveLocation")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={cancelForm}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                {t("shops.detail.cancel")}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          type="button"
          disabled={saving || tableMissing || initialLoading}
          onClick={startAdd}
          className="rounded-lg border border-dashed border-zinc-400 px-3 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-500 dark:text-zinc-300"
        >
          {t("shops.detail.gpsPanel.addExtraGpsLocation")}
        </button>
      )}
    </div>
  );
}
