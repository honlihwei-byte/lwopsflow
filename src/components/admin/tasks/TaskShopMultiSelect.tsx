"use client";

import { useI18n } from "@/components/i18n/LanguageProvider";

type Shop = { id: string; name: string };

type Props = {
  shops: Shop[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function TaskShopMultiSelect({ shops, selectedIds, onChange, disabled }: Props) {
  const { t } = useI18n();
  const selectedSet = new Set(selectedIds);

  function toggleShop(shopId: string) {
    if (disabled) return;
    if (selectedSet.has(shopId)) {
      onChange(selectedIds.filter((id) => id !== shopId));
    } else {
      onChange([...selectedIds, shopId]);
    }
  }

  function selectAll() {
    if (disabled) return;
    onChange(shops.map((s) => s.id));
  }

  function clearAll() {
    if (disabled) return;
    onChange([]);
  }

  const selectedShops = shops.filter((s) => selectedSet.has(s.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || shops.length === 0}
          onClick={selectAll}
          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {t("tasks.form.selectAllShops")}
        </button>
        <button
          type="button"
          disabled={disabled || selectedIds.length === 0}
          onClick={clearAll}
          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {t("tasks.form.clearShopSelection")}
        </button>
        <span className="self-center text-xs text-zinc-500">
          {t("tasks.form.shopsSelected").replace("{count}", String(selectedIds.length))}
        </span>
      </div>

      {selectedShops.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedShops.map((shop) => (
            <span
              key={shop.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-900"
            >
              <span className="truncate">{shop.name}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggleShop(shop.id)}
                className="shrink-0 rounded-full px-1 text-violet-700 hover:bg-violet-200 disabled:opacity-50"
                aria-label={t("tasks.form.removeShop").replace("{shop}", shop.name)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-amber-700">{t("tasks.form.noShopsSelected")}</p>
      )}

      <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-300 bg-white">
        {shops.length === 0 ? (
          <p className="p-3 text-sm text-zinc-500">{t("tasks.form.noShopsAvailable")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {shops.map((shop) => {
              const checked = selectedSet.has(shop.id);
              return (
                <li key={shop.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-zinc-300"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleShop(shop.id)}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{shop.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
