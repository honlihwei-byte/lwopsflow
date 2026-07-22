export function formatMinutes(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(minutes ?? 0) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

