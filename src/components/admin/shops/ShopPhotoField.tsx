"use client";

import { useEffect, useRef, useState } from "react";
import {
  clearShopPhotoUrl,
  getShopPhotoUrl,
  readImageFileAsDataUrl,
  setShopPhotoUrl,
} from "@/lib/shop-photo-client";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { ShopDefaultIcon } from "./ShopDefaultIcon";

type Props = {
  shopId: string;
  shopName: string;
  compact?: boolean;
  onPhotoChange?: (url: string | null) => void;
};

function notifyPhotoUpdated(shopId: string) {
  window.dispatchEvent(new CustomEvent("shop-photo-updated", { detail: { shopId } }));
}

export function ShopPhotoField({ shopId, shopName, compact, onPhotoChange }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrlState] = useState<string | null>(() => getShopPhotoUrl(shopId));
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError(t("shops.editForm.photo.chooseImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t("shops.editForm.photo.maxSize"));
      return;
    }
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setShopPhotoUrl(shopId, dataUrl);
      setPhotoUrlState(dataUrl);
      onPhotoChange?.(dataUrl);
      notifyPhotoUpdated(shopId);
    } catch {
      setError(t("shops.editForm.photo.couldNotLoad"));
    }
  }

  function handleRemove() {
    clearShopPhotoUrl(shopId);
    setPhotoUrlState(null);
    onPhotoChange?.(null);
    notifyPhotoUpdated(shopId);
    if (inputRef.current) inputRef.current.value = "";
  }

  const sizeClass = compact ? "h-20 w-20" : "h-28 w-28";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div
          className={`relative shrink-0 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-slate-50 ${sizeClass}`}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={`${shopName} photo`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#64748B]">
              <ShopDefaultIcon className={compact ? "h-8 w-8" : "h-10 w-10"} />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex w-fit rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
          >
            {photoUrl ? t("shops.detail.changePhoto") : t("shops.detail.uploadPhoto")}
          </button>
          {photoUrl ? (
            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex w-fit text-xs font-medium text-[#64748B] underline-offset-2 hover:text-[#EF4444] hover:underline"
            >
              {t("shops.detail.removePhoto")}
            </button>
          ) : null}
          {!compact ? (
            <p className="text-[11px] leading-snug text-[#64748B]">{t("shops.detail.photoFormatHint")}</p>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-xs text-[#EF4444]">{error}</p> : null}
    </div>
  );
}

/** Read-only photo display for list cards. */
export function ShopPhotoDisplay({
  shopId,
  shopName,
  className = "h-full w-full",
}: {
  shopId: string;
  shopName: string;
  className?: string;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    setPhotoUrl(getShopPhotoUrl(shopId));
    function onUpdate(e: Event) {
      const detail = (e as CustomEvent<{ shopId: string }>).detail;
      if (detail?.shopId === shopId) setPhotoUrl(getShopPhotoUrl(shopId));
    }
    window.addEventListener("shop-photo-updated", onUpdate);
    return () => window.removeEventListener("shop-photo-updated", onUpdate);
  }, [shopId]);

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={`${shopName} photo`}
        loading="lazy"
        decoding="async"
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 text-[#64748B] ${className}`}>
      <ShopDefaultIcon className="h-10 w-10" />
    </div>
  );
}
