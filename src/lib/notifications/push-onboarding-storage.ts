const STORAGE_KEY = "lwopsflow_push_onboarding_dismissed";

function localDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isPushOnboardingDismissedToday(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === localDateKey();
}

export function dismissPushOnboardingForToday(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, localDateKey());
}
