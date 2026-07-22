export type HelpPageId =
  | "dashboard"
  | "shops"
  | "staff"
  | "shift-schedule"
  | "attendance"
  | "reports"
  | "subscription"
  | "company-profile";

export type PageGuideContent = {
  title: string;
  what: string;
  why: string;
  how: string[];
  bestPractices: string[];
};

export const PAGE_GUIDES: Record<HelpPageId, PageGuideContent> = {
  dashboard: {
    title: "Dashboard",
    what: "Your home screen for day-to-day attendance oversight — quick links to shops, staff, and review tools.",
    why: "Managers land here to see where to go next and monitor setup progress before diving into reports.",
    how: [
      "Use the setup checklist to finish initial configuration.",
      "Open Shops or Staff from the shortcuts when you need to change configuration.",
      "Jump to Photo Proof, Selfie Review, or Risk Review when investigating exceptions.",
    ],
    bestPractices: [
      "Complete the setup checklist before asking staff to punch.",
      "Bookmark this page for daily check-ins.",
    ],
  },
  attendance: {
    title: "Attendance",
    what: "Live and historical punch records with GPS verification, issues badges, and export.",
    why: "This is the source of truth for who was on-site, when they clocked in/out, and whether verification passed.",
    how: [
      "Choose a date range and filter by shop or staff.",
      "Read issue badges (missing punch, weak GPS, photo proof, etc.) on each row or day cell.",
      "Export CSV for payroll or audits when the period looks correct.",
    ],
    bestPractices: [
      "Review flagged punches the same day when possible.",
      "Cross-check open shifts (clock in without clock out) before closing payroll.",
    ],
  },
  reports: {
    title: "Reports",
    what: "Month and range views summarizing hours, issues, and attendance patterns across shops.",
    why: "Summaries help you spot chronic problems (missing clock-outs, weak indoor GPS) without reading every punch.",
    how: [
      "Switch between Attendance and Absent views on the dashboard report panel.",
      "Use month view for payroll-style totals; use day/range for investigations.",
      "Click issue chips to understand what triggered a flag.",
    ],
    bestPractices: [
      "Run month-end reports after all shifts for the period are complete.",
      "Compare shops side by side if you operate multiple locations.",
    ],
  },
  shops: {
    title: "Shops",
    what: "Configure each location: GPS points, indoor mode, photo/selfie verification, shifts, and clock QR codes.",
    why: "Every punch is validated against a shop’s GPS and rules — incorrect shop setup causes failed or rejected punches.",
    how: [
      "Add a shop with name and main GPS coordinates (or multiple GPS points).",
      "Enable Indoor Confidence Mode for malls or high-rise sites.",
      "Set Anti Buddy Punch protection and verification mode per shop.",
      "Print the Clock QR so staff can open the punch page on-site.",
      "Add shift templates and assign staff schedules under each shop card.",
    ],
    bestPractices: [
      "Set GPS radius realistically (often 30–80 m for storefronts).",
      "Regenerate QR only when needed — old printed codes stop working.",
    ],
  },
  staff: {
    title: "Staff",
    what: "Employee roster, shop assignments, ID codes, and QR cards for clock identification.",
    why: "Only staff assigned to a shop may punch there; staff codes power the on-site clock UI.",
    how: [
      "Add staff with name, code, and assigned shops.",
      "Print or share ID QR codes for scanning at the clock page.",
      "Deactivate staff who leave — do not delete if they have attendance history.",
    ],
    bestPractices: [
      "Use short unique staff codes (e.g. MS04).",
      "Assign every active employee to at least one shop before they punch.",
    ],
  },
  "shift-schedule": {
    title: "Shift Schedule",
    what: "Per-shop working hours: fixed shop hours or shift-based templates and staff day schedules.",
    why: "Schedules drive expected hours, shift labels on reports, and staff “today status” on the clock page.",
    how: [
      "Open Admin → Shops and select a shop.",
      "For shift-based shops, create templates (Morning, Full, etc.) then assign staff to dates.",
      "Use copy week/day tools to speed up recurring schedules.",
    ],
    bestPractices: [
      "Create templates before bulk-assigning schedules.",
      "Keep template names consistent across shops for easier reporting.",
    ],
  },
  subscription: {
    title: "Subscription",
    what: "Your LW OpsFlow plan, limits (shops/staff), and billing status.",
    why: "Active subscription unlocks clock punches and admin features; expired trials block staff punching.",
    how: [
      "Review current plan and usage counts.",
      "Choose a plan and click Subscribe Now to pay via Stripe.",
      "Resolve subscription-required prompts before staff punch again.",
    ],
    bestPractices: [
      "Upgrade before you hit shop or staff limits.",
      "Keep billing contact email current under Company Profile.",
    ],
  },
  "company-profile": {
    title: "Company Profile",
    what: "Company name, ID for login, verification status, and billing contact details.",
    why: "Accurate profile data supports account recovery, invoices, and support requests.",
    how: [
      "Copy your Company ID for Company ID login.",
      "Update billing contact after email verification.",
      "Use read-only fields as reference — contact support to change legal company name if needed.",
    ],
    bestPractices: [
      "Store Company ID in a secure internal wiki.",
      "Use a monitored inbox for billing contact email.",
    ],
  },
};
