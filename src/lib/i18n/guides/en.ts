import type { TranslationTree } from "../types";

/** Page guide card content (English). */
export const guideEn: TranslationTree = {
  label: "Guide",
  hide: "Hide",
  show: "Show",
  whatThisPageDoes: "What this page does",
  whyItMatters: "Why it matters",
  howToUseIt: "How to use it",
  bestPractices: "Best practices",
  moreHelp: "More help",
  quickStart: "Quick Start Guide",
  moreInfo: "More information",
  pages: {
    dashboard: {
      title: "Dashboard",
      what: "Your home screen for day-to-day attendance oversight — quick links to shops, staff, and review tools.",
      why: "Managers land here to see where to go next and monitor setup progress before diving into reports.",
      how: {
        "0": "Use the setup checklist to finish initial configuration.",
        "1": "Open Shops or Staff from the shortcuts when you need to change configuration.",
        "2": "Jump to Photo Proof, Selfie Review, or Risk Review when investigating exceptions.",
      },
      bp: {
        "0": "Complete the setup checklist before asking staff to punch.",
        "1": "Bookmark this page for daily check-ins.",
      },
    },
    attendance: {
      title: "Attendance",
      what: "Live and historical punch records with GPS verification, issues badges, and export.",
      why: "This is the source of truth for who was on-site, when they clocked in/out, and whether verification passed.",
      how: {
        "0": "Choose a date range and filter by shop or staff.",
        "1": "Read issue badges (missing punch, weak GPS, photo proof, etc.) on each row or day cell.",
        "2": "Export CSV for payroll or audits when the period looks correct.",
      },
      bp: {
        "0": "Review flagged punches the same day when possible.",
        "1": "Cross-check open shifts (clock in without clock out) before closing payroll.",
      },
    },
    reports: {
      title: "Reports",
      what: "Month and range views summarizing hours, issues, and attendance patterns across shops.",
      why: "Summaries help you spot chronic problems (missing clock-outs, weak indoor GPS) without reading every punch.",
      how: {
        "0": "Switch between Attendance and Absent views on the dashboard report panel.",
        "1": "Use month view for payroll-style totals; use day/range for investigations.",
        "2": "Click issue chips to understand what triggered a flag.",
      },
      bp: {
        "0": "Run month-end reports after all shifts for the period are complete.",
        "1": "Compare shops side by side if you operate multiple locations.",
      },
    },
    shops: {
      title: "Shops",
      what: "Configure each location: GPS points, indoor mode, photo/selfie verification, shifts, and clock QR codes.",
      why: "Every punch is validated against a shop's GPS and rules — incorrect shop setup causes failed or rejected punches.",
      how: {
        "0": "Add a shop with name and main GPS coordinates (or multiple GPS points).",
        "1": "Enable Indoor Confidence Mode for malls or high-rise sites.",
        "2": "Set Anti Buddy Punch protection and verification mode per shop.",
        "3": "Print the Clock QR so staff can open the punch page on-site.",
        "4": "Add shift templates and assign staff schedules under each shop card.",
      },
      bp: {
        "0": "Set GPS radius realistically (often 30–80 m for storefronts).",
        "1": "Regenerate QR only when needed — old printed codes stop working.",
      },
    },
    staff: {
      title: "Staff",
      what: "Employee roster, shop assignments, ID codes, and QR cards for clock identification.",
      why: "Only staff assigned to a shop may punch there; staff codes power the on-site clock UI.",
      how: {
        "0": "Add staff with name, code, and assigned shops.",
        "1": "Print or share ID QR codes for scanning at the clock page.",
        "2": "Deactivate staff who leave — do not delete if they have attendance history.",
      },
      bp: {
        "0": "Use short unique staff codes (e.g. MS04).",
        "1": "Assign every active employee to at least one shop before they punch.",
      },
    },
    "shift-schedule": {
      title: "Shift Schedule",
      what: "Per-shop working hours: fixed shop hours or shift-based templates and staff day schedules.",
      why: "Schedules drive expected hours, shift labels on reports, and staff “today status” on the clock page.",
      how: {
        "0": "Open Admin → Shops and select a shop.",
        "1": "For shift-based shops, create templates (Morning, Full, etc.) then assign staff to dates.",
        "2": "Use copy week/day tools to speed up recurring schedules.",
      },
      bp: {
        "0": "Create templates before bulk-assigning schedules.",
        "1": "Keep template names consistent across shops for easier reporting.",
      },
    },
    subscription: {
      title: "Subscription",
      what: "Your LW OpsFlow plan, limits (shops/staff), and billing status.",
      why: "Active subscription unlocks clock punches and admin features; expired trials block staff punching.",
      how: {
        "0": "Review current plan and usage counts.",
        "1": "Choose a plan and click Subscribe Now to pay via Stripe.",
        "2": "Resolve subscription-required prompts before staff punch again.",
      },
      bp: {
        "0": "Upgrade before you hit shop or staff limits.",
        "1": "Keep billing contact email current under Company Profile.",
      },
    },
    "company-profile": {
      title: "Company Profile",
      what: "Company name, ID for login, verification status, and billing contact details.",
      why: "Accurate profile data supports account recovery, invoices, and support requests.",
      how: {
        "0": "Copy your Company ID for Company ID login.",
        "1": "Update billing contact after email verification.",
        "2": "Use read-only fields as reference — contact support to change legal company name if needed.",
      },
      bp: {
        "0": "Store Company ID in a secure internal wiki.",
        "1": "Use a monitored inbox for billing contact email.",
      },
    },
  },
};
