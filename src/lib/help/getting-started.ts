export type GettingStartedSection = {
  id: string;
  title: string;
  body: string;
  href?: string;
  hrefLabel?: string;
};

export const GETTING_STARTED_SECTIONS: GettingStartedSection[] = [
  {
    id: "shop",
    title: "Create your first shop",
    body: "Add a shop for each physical location. Set the shop name and GPS so punches can be verified on-site.",
    href: "/admin/shops",
    hrefLabel: "Go to Shops",
  },
  {
    id: "staff",
    title: "Add staff",
    body: "Create employee records with a staff code. Each person needs a unique code for clock identification.",
    href: "/admin/staff",
    hrefLabel: "Go to Staff",
  },
  {
    id: "assign",
    title: "Assign staff to shop",
    body: "When adding or editing staff, check every shop they are allowed to punch at. Unassigned staff cannot clock at that location.",
    href: "/admin/staff",
    hrefLabel: "Manage staff assignments",
  },
  {
    id: "verification",
    title: "Configure attendance verification",
    body: "Under each shop, set Anti Buddy Punch protection: GPS only, selfie, location photo proof, or combined modes.",
    href: "/admin/shops",
    hrefLabel: "Shop settings",
  },
  {
    id: "templates",
    title: "Create shift templates",
    body: "For shift-based shops, define reusable templates (Morning, Full, Part Time) with start, end, and break minutes.",
    href: "/admin/shops",
    hrefLabel: "Open a shop",
  },
  {
    id: "schedule",
    title: "Schedule staff",
    body: "Assign templates to staff by date on the shop card. Use copy week to fill recurring rosters faster.",
    href: "/admin/shops",
    hrefLabel: "Schedule in Shops",
  },
  {
    id: "punch",
    title: "Staff clock in/out",
    body: "Staff scan the shop Clock QR, select their name, wait for GPS verification (or photo/selfie if required), then tap Clock In or Out.",
    href: "/admin/shops",
    hrefLabel: "Print Clock QR",
  },
  {
    id: "reports",
    title: "Review attendance reports",
    body: "Use the Attendance dashboard to filter punches, read issue badges, and export CSV for payroll.",
    href: "/admin",
    hrefLabel: "Open Attendance",
  },
];
