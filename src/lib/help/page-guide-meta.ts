import type { HelpPageId } from "./page-guides";

/** Step counts for i18n keys: guide.pages.{id}.how.{n} and guide.pages.{id}.bp.{n} */
export const PAGE_GUIDE_META: Record<HelpPageId, { how: number; bp: number }> = {
  dashboard: { how: 3, bp: 2 },
  attendance: { how: 3, bp: 2 },
  reports: { how: 3, bp: 2 },
  shops: { how: 5, bp: 2 },
  staff: { how: 3, bp: 2 },
  "shift-schedule": { how: 3, bp: 2 },
  subscription: { how: 3, bp: 2 },
  "company-profile": { how: 3, bp: 2 },
};
