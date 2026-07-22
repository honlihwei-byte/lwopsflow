"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { PERMISSION_GROUPS, ROLE_TEMPLATES, SHOP_SCOPES } from "@/lib/permissions/keys";
import type { PermissionGroup, PermissionKey, RoleTemplate, ShopScope } from "@/lib/permissions/keys";
import { ROLE_TEMPLATE_DEFAULTS } from "@/lib/permissions/templates";
import { resolveEffectivePermissions } from "@/lib/permissions/resolve";
import {
  ADVANCED_PERMISSION_GROUPS,
  permissionLabelKey,
  RECOMMENDED_PERMISSION_GROUPS,
  RECOMMENDED_PERMISSION_KEYS,
  ROLE_HIERARCHY,
} from "@/lib/permissions/ui-config";

type Shop = { id: string; name: string };

type ProfilePayload = {
  position_id: string | null;
  role_template: RoleTemplate;
  shop_scope: ShopScope;
  permission_overrides: Record<string, boolean>;
  scope_shop_ids: string[];
};

type CompanyPositionOption = {
  id: string;
  name: string;
};

function advancedKeysForGroup(group: PermissionGroup): PermissionKey[] {
  const all = PERMISSION_GROUPS[group] as readonly PermissionKey[];
  if (ADVANCED_PERMISSION_GROUPS.includes(group)) return [...all];
  const highlighted = new Set(RECOMMENDED_PERMISSION_KEYS[group] ?? []);
  return all.filter((k) => !highlighted.has(k));
}

export function StaffPermissionsPanel({
  staffId,
  shops,
  onSaved,
}: {
  staffId: string;
  shops: Shop[];
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presetNotice, setPresetNotice] = useState(false);
  const [positions, setPositions] = useState<CompanyPositionOption[]>([]);
  const [profile, setProfile] = useState<ProfilePayload>({
    position_id: null,
    role_template: "staff",
    shop_scope: "assigned_only",
    permission_overrides: {},
    scope_shop_ids: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${encodeURIComponent(staffId)}/permissions`, {
        credentials: "include",
      });
      const j = (await res.json()) as {
        error?: string;
        profile?: ProfilePayload & { scope_shop_ids?: string[]; position_id?: string | null };
        positions?: CompanyPositionOption[];
      };
      if (!res.ok) throw new Error(j.error || "Failed to load");
      if (j.positions) {
        setPositions(j.positions.map((p) => ({ id: p.id, name: p.name })));
      }
      if (j.profile) {
        setProfile({
          position_id: j.profile.position_id ?? null,
          role_template: j.profile.role_template,
          shop_scope: j.profile.shop_scope,
          permission_overrides: j.profile.permission_overrides ?? {},
          scope_shop_ids: j.profile.scope_shop_ids ?? [],
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPositionName = useMemo(
    () => positions.find((p) => p.id === profile.position_id)?.name ?? null,
    [positions, profile.position_id],
  );

  const effective = useMemo(
    () =>
      resolveEffectivePermissions({
        role_template: profile.role_template,
        permission_overrides: profile.permission_overrides,
      }),
    [profile],
  );

  const hierarchyLevel = useMemo(() => {
    const row = ROLE_HIERARCHY.find((r) => r.id === profile.role_template);
    return row?.level ?? 1;
  }, [profile.role_template]);

  function permissionLabel(key: PermissionKey): string {
    const path = permissionLabelKey(key);
    const label = t(path);
    return label === path ? key : label;
  }

  function applyRolePreset(role: RoleTemplate) {
    const defaults = ROLE_TEMPLATE_DEFAULTS[role];
    setProfile((p) => ({
      ...p,
      role_template: role,
      shop_scope: defaults.shop_scope,
      permission_overrides: {},
    }));
    setPresetNotice(true);
    window.setTimeout(() => setPresetNotice(false), 2500);
  }

  function togglePermission(key: PermissionKey, enabled: boolean) {
    setProfile((p) => ({
      ...p,
      permission_overrides: { ...p.permission_overrides, [key]: enabled },
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${encodeURIComponent(staffId)}/permissions`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to save");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function renderPermissionCheckboxes(keys: PermissionKey[]) {
    if (keys.length === 0) return null;
    return (
      <ul className="space-y-1">
        {keys.map((key) => (
          <li key={key}>
            <label className="flex items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={effective[key] === true}
                onChange={(e) => togglePermission(key, e.target.checked)}
              />
              {permissionLabel(key)}
            </label>
          </li>
        ))}
      </ul>
    );
  }

  if (loading) {
    return <p className="text-xs text-zinc-500">{t("permissions.loading")}</p>;
  }

  const advancedSections = [
    ...ADVANCED_PERMISSION_GROUPS,
    ...RECOMMENDED_PERMISSION_GROUPS.filter((g) => advancedKeysForGroup(g).length > 0),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
      <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
        {t("permissions.systemRoleTitle")}
      </p>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {presetNotice ? (
        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          {t("permissions.presetApplied")}
        </p>
      ) : null}

      <div className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
        <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
          {t("positions.positionLabel")}
        </p>
        <p className="mt-1 text-[10px] text-zinc-500">{t("positions.jobTitleOnlyHint")}</p>
        <select
          className="mt-2 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={profile.position_id ?? ""}
          onChange={(e) =>
            setProfile((p) => ({
              ...p,
              position_id: e.target.value || null,
            }))
          }
        >
          <option value="">{t("positions.noPosition")}</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {selectedPositionName ? (
          <p className="mt-1 text-[10px] text-zinc-600">
            {t("positions.positionLabel")}: <strong>{selectedPositionName}</strong>
          </p>
        ) : null}
      </div>

      <div className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
        <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
          {t("permissions.systemRoleLabel")}
        </p>
        <p className="mt-1 text-[10px] text-zinc-500">{t("permissions.systemRoleHint")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {ROLE_HIERARCHY.map((row, i) => {
            const isStaffRole = row.id !== "company_admin";
            const active = isStaffRole && row.id === profile.role_template;
            const level = isStaffRole ? ROLE_HIERARCHY.find((r) => r.id === row.id)?.level ?? 0 : 5;
            const dimmed = isStaffRole && level < hierarchyLevel;
            return (
              <span key={row.id} className="flex items-center gap-1">
                {i > 0 ? (
                  <span className="text-[10px] text-zinc-400" aria-hidden>
                    →
                  </span>
                ) : null}
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    active
                      ? "bg-blue-600 text-white"
                      : row.id === "company_admin"
                        ? "border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-600"
                        : dimmed
                          ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
                  ].join(" ")}
                >
                  {t(`permissions.roles.${row.id}`)}
                </span>
              </span>
            );
          })}
        </div>
        <select
          className="mt-2 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={profile.role_template}
          onChange={(e) => applyRolePreset(e.target.value as RoleTemplate)}
        >
          {[...ROLE_TEMPLATES]
            .sort(
              (a, b) =>
                (ROLE_HIERARCHY.find((r) => r.id === a)?.level ?? 0) -
                (ROLE_HIERARCHY.find((r) => r.id === b)?.level ?? 0),
            )
            .map((r) => (
              <option key={r} value={r}>
                {t(`permissions.roles.${r}`)}
              </option>
            ))}
        </select>
      </div>

      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {t("permissions.shopScope")}
        <select
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          value={profile.shop_scope}
          onChange={(e) =>
            setProfile((p) => ({ ...p, shop_scope: e.target.value as ShopScope }))
          }
        >
          {SHOP_SCOPES.map((s) => (
            <option key={s} value={s}>
              {t(`permissions.scopes.${s}`)}
            </option>
          ))}
        </select>
      </label>

      {profile.shop_scope === "selected_shops" ? (
        <fieldset className="max-h-32 space-y-1 overflow-y-auto rounded border border-zinc-200 p-2 text-xs dark:border-zinc-700">
          <legend className="px-1 font-semibold">{t("permissions.selectedShops")}</legend>
          {shops.map((shop) => (
            <label key={shop.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={profile.scope_shop_ids.includes(shop.id)}
                onChange={(e) => {
                  setProfile((p) => ({
                    ...p,
                    scope_shop_ids: e.target.checked
                      ? [...p.scope_shop_ids, shop.id]
                      : p.scope_shop_ids.filter((id) => id !== shop.id),
                  }));
                }}
              />
              {shop.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      <button
        type="button"
        onClick={() => applyRolePreset(profile.role_template)}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold dark:border-zinc-600 dark:bg-zinc-900"
        title={t("permissions.applyTemplateHint")}
      >
        {t("permissions.applyTemplate")}
      </button>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {t("permissions.recommendedTitle")}
        </p>
        {RECOMMENDED_PERMISSION_GROUPS.map((group) => {
          const keys = RECOMMENDED_PERMISSION_KEYS[group] ?? [];
          return (
            <div
              key={group}
              className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {t(`permissions.groups.${group}`)}
              </p>
              <div className="mt-2">{renderPermissionCheckboxes(keys)}</div>
            </div>
          );
        })}
      </div>

      <details className="rounded border border-zinc-300 bg-white p-2 dark:border-zinc-600 dark:bg-zinc-950">
        <summary className="cursor-pointer text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {t("permissions.advancedTitle")}
        </summary>
        <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          {t("permissions.advancedHint")}
        </p>
        <div className="mt-2 space-y-2">
          {advancedSections.map((group) => {
            const keys = advancedKeysForGroup(group);
            if (keys.length === 0) return null;
            return (
              <div key={group} className="rounded border border-zinc-100 p-2 dark:border-zinc-800">
                <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  {t(`permissions.groups.${group}`)}
                </p>
                <div className="mt-1">{renderPermissionCheckboxes(keys)}</div>
              </div>
            );
          })}
        </div>
      </details>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {saving ? t("permissions.saving") : t("permissions.save")}
      </button>
    </div>
  );
}
