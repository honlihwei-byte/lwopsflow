"use client";

import type { EmployeeClockShopOption } from "@/lib/employee-clock-shop-access";

type Props = {
  shops: EmployeeClockShopOption[];
  selectedShopId: string;
  onSelect: (shopId: string) => void;
  label: string;
  pickClockOutHint?: string | null;
  formatShopLabel: (shop: EmployeeClockShopOption) => string;
  disabled?: boolean;
};

export function EmployeeClockShopSelector({
  shops,
  selectedShopId,
  onSelect,
  label,
  pickClockOutHint,
  formatShopLabel,
  disabled = false,
}: Props) {
  const singleShop = shops.length === 1;

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <label className="block text-sm font-medium text-zinc-800">
        {label}
        {singleShop && selectedShopId ? (
          <p className="mt-1 text-base font-semibold text-zinc-900">
            {formatShopLabel(shops[0]!)}
          </p>
        ) : (
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            value={selectedShopId}
            disabled={disabled || singleShop}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">—</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {formatShopLabel(shop)}
              </option>
            ))}
          </select>
        )}
      </label>
      {pickClockOutHint ? (
        <p className="text-xs text-amber-800">{pickClockOutHint}</p>
      ) : null}
    </div>
  );
}
