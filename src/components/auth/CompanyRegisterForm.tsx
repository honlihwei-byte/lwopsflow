"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btnPrimary } from "@/components/marketing/MarketingShell";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { PasswordInputField } from "@/components/auth/PasswordInputField";
import { RegisterPhoneField } from "@/components/auth/RegisterPhoneField";
import { RegisterTrustPanel } from "@/components/auth/RegisterTrustPanel";
import {
  COUNTRY_DEFAULT_TIMEZONE,
  detectRegisterDefaults,
  dialCodeForCountry,
  formatRegisterPhone,
  REGISTER_BUSINESS_TYPES,
  REGISTER_COUNTRY_CODES,
  REGISTER_STAFF_ESTIMATES,
  REGISTER_TIMEZONE_OPTIONS,
  timezoneForCountry,
  type RegisterBusinessType,
  type RegisterCountryCode,
  type RegisterPhoneDial,
} from "@/lib/register-form-options";
import { supportWhatsAppUrl } from "@/lib/support-contact";

type FormState = {
  company_name: string;
  owner_name: string;
  country_code: RegisterPhoneDial | string;
  phone_number: string;
  email: string;
  password: string;
  confirm_password: string;
  business_type: RegisterBusinessType;
  staff_estimate: (typeof REGISTER_STAFF_ESTIMATES)[number];
  country: RegisterCountryCode;
  timezone: string;
};

const INITIAL_FORM: FormState = {
  company_name: "",
  owner_name: "",
  country_code: "+60",
  phone_number: "",
  email: "",
  password: "",
  confirm_password: "",
  business_type: "retail",
  staff_estimate: "1-10",
  country: "MY",
  timezone: COUNTRY_DEFAULT_TIMEZONE.MY,
};

const fieldInputClass =
  "w-full rounded-xl border px-4 py-3 text-base dark:border-zinc-600 dark:bg-zinc-900";

export function CompanyRegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { country, timezone } = detectRegisterDefaults();
    setForm((f) => ({
      ...f,
      country,
      timezone,
      country_code: dialCodeForCountry(country),
    }));
  }, []);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleCountryChange(country: RegisterCountryCode) {
    setForm((f) => ({
      ...f,
      country,
      timezone: timezoneForCountry(country),
      country_code: dialCodeForCountry(country),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const phone = formatRegisterPhone(form.country_code, form.phone_number);
    if (!phone) {
      setError(t("register.phoneRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.company_name,
          owner_name: form.owner_name,
          phone,
          email: form.email,
          password: form.password,
          confirm_password: form.confirm_password,
          business_type: form.business_type,
          staff_estimate: form.staff_estimate,
          country: form.country,
          timezone: form.timezone,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.pending && form.email) {
          router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
          return;
        }
        setError(j.error || "Registration failed");
        return;
      }
      const email = j.email || form.email;
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const timezoneOptions = REGISTER_TIMEZONE_OPTIONS.includes(form.timezone)
    ? REGISTER_TIMEZONE_OPTIONS
    : [form.timezone, ...REGISTER_TIMEZONE_OPTIONS];

  const whatsappHref = supportWhatsAppUrl();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="text-center">
        <div className="mb-5 flex justify-center">
          <BrandLogo size="login" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          {t("register.title")}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
          {t("register.subtitle")}
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-start lg:gap-8">
        <div className="order-1 lg:order-2">
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
              {t("register.companyName")}
              <input
                value={form.company_name}
                onChange={(e) => update("company_name", e.target.value)}
                className={fieldInputClass}
                required
                autoComplete="organization"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
              {t("register.contactName")}
              <input
                value={form.owner_name}
                onChange={(e) => update("owner_name", e.target.value)}
                className={fieldInputClass}
                required
                autoComplete="name"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
              {t("register.email")}
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className={fieldInputClass}
                required
                autoComplete="email"
              />
            </label>

            <RegisterPhoneField
              className="sm:col-span-2"
              label={t("register.phone")}
              countryCode={form.country_code}
              phoneNumber={form.phone_number}
              onCountryCodeChange={(dial) => update("country_code", dial)}
              onPhoneNumberChange={(digits) => update("phone_number", digits)}
            />

            <PasswordInputField
              className="sm:col-span-1"
              label={t("register.password")}
              value={form.password}
              onChange={(v) => update("password", v)}
              helperText={t("register.passwordMinHelper")}
              autoComplete="new-password"
            />
            <PasswordInputField
              className="sm:col-span-1"
              label={t("register.confirmPassword")}
              value={form.confirm_password}
              onChange={(v) => update("confirm_password", v)}
              autoComplete="new-password"
            />

            <fieldset className="grid gap-4 rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 sm:col-span-2 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900/50">
              <legend className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:col-span-2">
                {t("register.businessSetup")}
              </legend>
              <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-1">
                {t("register.businessType")}
                <select
                  value={form.business_type}
                  onChange={(e) => update("business_type", e.target.value as RegisterBusinessType)}
                  className={fieldInputClass}
                >
                  {REGISTER_BUSINESS_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(`register.businessTypes.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-1">
                {t("register.staffEstimate")}
                <select
                  value={form.staff_estimate}
                  onChange={(e) =>
                    update("staff_estimate", e.target.value as FormState["staff_estimate"])
                  }
                  className={fieldInputClass}
                >
                  {REGISTER_STAFF_ESTIMATES.map((value) => (
                    <option key={value} value={value}>
                      {t(`register.staffEstimates.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-1">
                {t("register.country")}
                <select
                  value={form.country}
                  onChange={(e) => handleCountryChange(e.target.value as RegisterCountryCode)}
                  className={fieldInputClass}
                >
                  {REGISTER_COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {t(`register.countries.${code}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-1">
                {t("register.timezone")}
                <select
                  value={form.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                  className={fieldInputClass}
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            {error ? (
              <p className="text-center text-sm font-medium text-red-600 sm:col-span-2">{error}</p>
            ) : null}

            <p className="text-center text-sm sm:col-span-2">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              >
                {t("register.whatsappHelp")}
              </a>
            </p>

            <button
              type="submit"
              disabled={loading}
              className={btnPrimary("sm:col-span-2 w-full py-3.5 text-base disabled:opacity-50")}
            >
              {loading ? t("register.creating") : t("register.startFreeTrial")}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
            {t("register.haveAccount")}{" "}
            <Link href="/login" className="font-semibold text-[#2563EB] underline-offset-2 hover:underline">
              {t("login.title")}
            </Link>
          </p>
        </div>

        <div className="order-0 lg:order-1">
          <RegisterTrustPanel />
        </div>
      </div>
    </div>
  );
}
