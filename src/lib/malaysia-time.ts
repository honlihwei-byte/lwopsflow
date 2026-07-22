/** Official business timezone for attendance. */
export const MALAYSIA_TZ = "Asia/Kuala_Lumpur";

type DateParts = { year: string; month: string; day: string; hour: string; minute: string; second: string };

function partsInMalaysia(date: Date): DateParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAYSIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: map.year ?? "0000",
    month: map.month ?? "01",
    day: map.day ?? "01",
    hour: map.hour ?? "00",
    minute: map.minute ?? "00",
    second: map.second ?? "00",
  };
}

/** YYYY-MM-DD in Malaysia. */
export function malaysiaDateYmd(date: Date): string {
  const p = partsInMalaysia(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** HH:mm:ss in Malaysia (24-hour). */
export function malaysiaTimeHms(date: Date): string {
  const p = partsInMalaysia(date);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** e.g. 06 Jun 2026 — for task proof watermark date line. */
export function formatMalaysiaWatermarkDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAYSIA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Value for `<input type="datetime-local" />` interpreted as Malaysia wall time. */
export function malaysiaDatetimeLocalValue(date: Date = new Date()): string {
  const p = partsInMalaysia(date);
  return `${malaysiaDateYmd(date)}T${p.hour}:${p.minute}`;
}

/** Parse datetime-local string as Malaysia (+08:00). */
export function parseMalaysiaDatetimeLocal(value: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wall-clock instant from stored event_date + event_time (Malaysia +08:00). */
export function parseMalaysiaEventInstant(
  eventDate: string | null | undefined,
  eventTime: string | null | undefined,
): number | null {
  const date = eventDate?.trim().slice(0, 10);
  const timeRaw = eventTime?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  let hms: string | null = null;
  if (timeRaw) {
    if (looksLikeIsoTimestamp(timeRaw)) {
      const d = new Date(timeRaw);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    const m = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      hms = `${m[1]!.padStart(2, "0")}:${m[2]!}:${(m[3] ?? "00").padStart(2, "0")}`;
    }
  }
  if (!hms) return null;

  const d = new Date(`${date}T${hms}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function looksLikeIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) || value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);
}

/** Normalize stored event_time or ISO to HH:mm:ss Malaysia. */
export function formatEventTimeDisplay(
  value: string | null | undefined,
  fallbackCreatedAt?: string | null,
): string {
  const raw = value?.trim();
  if (raw && looksLikeIsoTimestamp(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return malaysiaTimeHms(d);
  }
  if (raw) {
    const noTz = raw.replace(/[Zz]$/, "").replace(/[+-]\d{2}(?::\d{2})?$/, "");
    if (noTz.includes("T")) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return malaysiaTimeHms(d);
    }
    const m = noTz.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return `${m[1]!.padStart(2, "0")}:${m[2]!}:${(m[3] ?? "00").padStart(2, "0")}`;
    }
  }
  if (fallbackCreatedAt) {
    const d = new Date(fallbackCreatedAt);
    if (!Number.isNaN(d.getTime())) return malaysiaTimeHms(d);
  }
  return raw ?? "—";
}

/** Normalize to YYYY-MM-DD (Malaysia calendar day from instant or date string). */
export function formatEventDateDisplay(
  value: string | null | undefined,
  fallbackCreatedAt?: string | null,
): string {
  const raw = value?.trim();
  if (raw && looksLikeIsoTimestamp(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return malaysiaDateYmd(d);
  }
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (fallbackCreatedAt) {
    const d = new Date(fallbackCreatedAt);
    if (!Number.isNaN(d.getTime())) return malaysiaDateYmd(d);
  }
  return raw?.slice(0, 10) ?? "—";
}

/** Recorded-at column: YYYY-MM-DD HH:mm:ss (Malaysia). */
export function formatMalaysiaRecordedAt(isoUtc: string | null | undefined): string {
  if (!isoUtc) return "—";
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return "—";
  return `${malaysiaDateYmd(d)} ${malaysiaTimeHms(d)}`;
}

/** @deprecated Use formatEventTimeDisplay */
export function formatEventTimeMalaysia(eventTime: string): string {
  return formatEventTimeDisplay(eventTime);
}

/** UTC ISO bounds for one Malaysia calendar day (for DB created_at filters). */
export function malaysiaDayUtcBounds(ymd: string): { start: string; end: string } {
  return {
    start: new Date(`${ymd}T00:00:00+08:00`).toISOString(),
    end: new Date(`${ymd}T23:59:59.999+08:00`).toISOString(),
  };
}
