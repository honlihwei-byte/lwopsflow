import { COMPANY_TIMEZONE_OPTIONS } from "@/lib/company-timezones";

/** Stored in companies.business_type — display via i18n only. */
export const REGISTER_BUSINESS_TYPES = [
  "retail",
  "fnb",
  "services",
  "warehouse",
  "office",
  "other",
] as const;

export type RegisterBusinessType = (typeof REGISTER_BUSINESS_TYPES)[number];

export const REGISTER_COUNTRY_CODES = ["MY", "SG", "ID", "TH", "BN"] as const;

export type RegisterCountryCode = (typeof REGISTER_COUNTRY_CODES)[number];

export const COUNTRY_DEFAULT_TIMEZONE: Record<RegisterCountryCode, string> = {
  MY: "Asia/Kuala_Lumpur",
  SG: "Asia/Singapore",
  ID: "Asia/Jakarta",
  TH: "Asia/Bangkok",
  BN: "Asia/Brunei",
};

const TIMEZONE_TO_COUNTRY: Partial<Record<string, RegisterCountryCode>> = {
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Singapore": "SG",
  "Asia/Jakarta": "ID",
  "Asia/Bangkok": "TH",
  "Asia/Brunei": "BN",
};

/** Staff estimate ranges stored in companies.staff_estimate. */
export const REGISTER_STAFF_ESTIMATES = ["1-10", "11-30", "31-50", "51-100", "100+"] as const;

/** Timezones shown on register (auto-selected by country; user may override). */
export const REGISTER_TIMEZONE_OPTIONS: string[] = [
  ...Object.values(COUNTRY_DEFAULT_TIMEZONE),
  ...COMPANY_TIMEZONE_OPTIONS.filter(
    (tz) => !Object.values(COUNTRY_DEFAULT_TIMEZONE).includes(tz as (typeof COUNTRY_DEFAULT_TIMEZONE)[RegisterCountryCode]),
  ),
];

export function detectRegisterDefaults(): {
  country: RegisterCountryCode;
  timezone: string;
} {
  if (typeof Intl === "undefined") {
    return { country: "MY", timezone: COUNTRY_DEFAULT_TIMEZONE.MY };
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const country = TIMEZONE_TO_COUNTRY[tz] ?? "MY";
  return {
    country,
    timezone: COUNTRY_DEFAULT_TIMEZONE[country],
  };
}

export function timezoneForCountry(country: RegisterCountryCode): string {
  return COUNTRY_DEFAULT_TIMEZONE[country];
}

/** Dial codes available on the registration phone field (display order). */
export const REGISTER_PHONE_DIAL_CODES = [
  { dial: "+60", country: "MY", labelKey: "register.phoneDial.MY" },
  { dial: "+65", country: "SG", labelKey: "register.phoneDial.SG" },
  { dial: "+62", country: "ID", labelKey: "register.phoneDial.ID" },
  { dial: "+66", country: "TH", labelKey: "register.phoneDial.TH" },
  { dial: "+673", country: "BN", labelKey: "register.phoneDial.BN" },
  { dial: "+86", country: "CN", labelKey: "register.phoneDial.CN" },
  { dial: "+886", country: "TW", labelKey: "register.phoneDial.TW" },
  { dial: "+852", country: "HK", labelKey: "register.phoneDial.HK" },
] as const;

export type RegisterPhoneDial = (typeof REGISTER_PHONE_DIAL_CODES)[number]["dial"];

const COUNTRY_TO_DIAL: Record<RegisterCountryCode, RegisterPhoneDial> = {
  MY: "+60",
  SG: "+65",
  ID: "+62",
  TH: "+66",
  BN: "+673",
};

export function dialCodeForCountry(country: RegisterCountryCode): RegisterPhoneDial {
  return COUNTRY_TO_DIAL[country];
}

export function normalizeRegisterPhoneDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** Stored in companies.phone — single text column, no schema change. */
export function formatRegisterPhone(countryCode: string, nationalNumber: string): string {
  const code = countryCode.trim();
  const digits = normalizeRegisterPhoneDigits(nationalNumber);
  if (!code || !digits) return "";
  return `${code} ${digits}`;
}
