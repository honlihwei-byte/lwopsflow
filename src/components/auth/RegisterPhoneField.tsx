"use client";

import { useId, useMemo } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import {
  formatRegisterPhone,
  normalizeRegisterPhoneDigits,
  REGISTER_PHONE_DIAL_CODES,
  type RegisterPhoneDial,
} from "@/lib/register-form-options";

type Props = {
  label: string;
  countryCode: RegisterPhoneDial | string;
  phoneNumber: string;
  onCountryCodeChange: (dial: RegisterPhoneDial | string) => void;
  onPhoneNumberChange: (digits: string) => void;
  className?: string;
};

export function RegisterPhoneField({
  label,
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  className = "",
}: Props) {
  const { t } = useI18n();
  const id = useId();

  const formattedPreview = useMemo(
    () => formatRegisterPhone(countryCode, phoneNumber),
    [countryCode, phoneNumber],
  );

  return (
    <div className={`flex flex-col gap-2 text-sm font-medium ${className}`}>
      <span>{label}</span>
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-[minmax(11.5rem,42%)_1fr]">
        <select
          value={countryCode}
          onChange={(e) => onCountryCodeChange(e.target.value)}
          aria-label={t("register.phoneCountryCode")}
          className="w-full rounded-xl border px-3 py-3 text-base dark:border-zinc-600 dark:bg-zinc-900"
        >
          {REGISTER_PHONE_DIAL_CODES.map((opt) => (
            <option key={opt.dial} value={opt.dial}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={phoneNumber}
          onChange={(e) => onPhoneNumberChange(normalizeRegisterPhoneDigits(e.target.value))}
          placeholder={t("register.phoneNumberPlaceholder")}
          required
          className="min-w-0 w-full rounded-xl border px-4 py-3 text-base dark:border-zinc-600 dark:bg-zinc-900"
        />
      </div>
      {formattedPreview ? (
        <span className="text-xs font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
          {formattedPreview}
        </span>
      ) : null}
    </div>
  );
}
