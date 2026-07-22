/** Device-wide remembered staff for clock pages (not per shop). */
export type RememberedStaff = {
  staff_id: string;
  staff_name: string;
  staff_code: string;
};

const STORAGE_KEY = "punch-remembered-staff-v1";

export function readRememberedStaff(): RememberedStaff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedStaff;
    if (
      !parsed ||
      typeof parsed.staff_id !== "string" ||
      typeof parsed.staff_name !== "string" ||
      typeof parsed.staff_code !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRememberedStaff(staff: RememberedStaff): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(staff));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearRememberedStaff(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function staffOptionToRemembered(staff: {
  id: string;
  staff_name: string;
  staff_code: string;
}): RememberedStaff {
  return {
    staff_id: staff.id,
    staff_name: staff.staff_name,
    staff_code: staff.staff_code,
  };
}
