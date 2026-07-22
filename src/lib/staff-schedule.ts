/** Staff shift schedule types and resolution (Malaysia weekday: 0=Mon … 6=Sun). */

export type ScheduleMode =
  | "fixed_daily"
  | "weekly"
  | "bi_weekly"
  | "monthly"
  | "custom";

export type ScheduleSlot = {
  id?: string;
  day_of_week: number | null;
  schedule_date: string | null;
  biweekly_week: number | null;
  start_time: string;
  end_time: string;
};

export type StaffScheduleProfile = {
  schedule_mode: ScheduleMode;
  default_start_time: string;
  default_end_time: string;
  schedule_timezone: string;
  slots: ScheduleSlot[];
};

export const SCHEDULE_MODE_LABELS: Record<ScheduleMode, string> = {
  fixed_daily: "Fixed daily",
  weekly: "Weekly schedule",
  bi_weekly: "Bi-weekly schedule",
  monthly: "Monthly schedule",
  custom: "Custom date schedule",
};

export function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatMinutesAsTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Monday=0 from JS getDay() where Sunday=0 */
export function weekdayIndexFromYmd(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00`);
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

export function biweeklyWeekNumber(ymd: string): 1 | 2 {
  const d = new Date(`${ymd}T12:00:00`);
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000));
  return (week % 2 === 0 ? 1 : 2) as 1 | 2;
}

export function defaultStaffSchedule(): StaffScheduleProfile {
  return {
    schedule_mode: "fixed_daily",
    default_start_time: "09:00",
    default_end_time: "18:00",
    schedule_timezone: "Asia/Kuala_Lumpur",
    slots: [],
  };
}

/** Scheduled windows for a calendar day (may be multiple for part-time). */
export function scheduledSlotsForDate(
  profile: StaffScheduleProfile,
  ymd: string,
): ScheduleSlot[] {
  const mode = profile.schedule_mode;

  if (mode === "fixed_daily") {
    return [
      {
        day_of_week: null,
        schedule_date: null,
        biweekly_week: null,
        start_time: profile.default_start_time.slice(0, 5),
        end_time: profile.default_end_time.slice(0, 5),
      },
    ];
  }

  if (mode === "custom" || mode === "monthly") {
    const onDate = profile.slots.filter((s) => s.schedule_date === ymd);
    if (onDate.length > 0) return onDate;
    if (mode === "monthly") {
      const dom = Number(ymd.slice(8, 10));
      return profile.slots.filter((s) => {
        if (!s.schedule_date) return false;
        return Number(s.schedule_date.slice(8, 10)) === dom;
      });
    }
    return [];
  }

  const dow = weekdayIndexFromYmd(ymd);
  let slots = profile.slots.filter((s) => s.day_of_week === dow);

  if (mode === "bi_weekly") {
    const bw = biweeklyWeekNumber(ymd);
    slots = slots.filter((s) => s.biweekly_week == null || s.biweekly_week === bw);
  }

  if (slots.length === 0 && profile.slots.length === 0) {
    return [
      {
        day_of_week: dow,
        schedule_date: null,
        biweekly_week: null,
        start_time: profile.default_start_time.slice(0, 5),
        end_time: profile.default_end_time.slice(0, 5),
      },
    ];
  }

  return slots;
}

export function scheduledMsForDay(profile: StaffScheduleProfile, ymd: string): number {
  const slots = scheduledSlotsForDate(profile, ymd);
  return slots.reduce((sum, s) => {
    const start = parseTimeToMinutes(s.start_time);
    let end = parseTimeToMinutes(s.end_time);
    if (end <= start) end += 24 * 60;
    return sum + (end - start) * 60 * 1000;
  }, 0);
}
