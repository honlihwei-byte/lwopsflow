"use client";

import { useId, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  autoComplete?: string;
  required?: boolean;
  className?: string;
};

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
        />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function PasswordInputField({
  label,
  value,
  onChange,
  helperText,
  autoComplete,
  required = true,
  className = "",
}: Props) {
  const { t } = useI18n();
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <label className={`flex flex-col gap-2 text-sm font-medium ${className}`}>
      {label}
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          className="w-full rounded-xl border py-3 pl-4 pr-12 dark:border-zinc-600 dark:bg-zinc-900"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("register.hidePassword") : t("register.showPassword")}
          aria-pressed={visible}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
      {helperText ? (
        <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">{helperText}</span>
      ) : null}
    </label>
  );
}
