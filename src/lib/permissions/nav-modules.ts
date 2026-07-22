import type { PermissionKey } from "@/lib/permissions/keys";

export type OpsModuleId =
  | "dashboard"
  | "attendance"
  | "schedule"
  | "shops"
  | "employees"
  | "tasks"
  | "settings"
  | "billing"
  | "clock"
  | "notifications"
  | "my_tasks"
  | "my_attendance"
  | "account_settings";

export type OpsNavItem = {
  id: OpsModuleId;
  labelKey: string;
  href: string;
  match: (path: string) => boolean;
  /** Any one of these permissions grants access. */
  permissions: PermissionKey[];
  /** Personal employee items (always shown when authenticated). */
  personal?: boolean;
};

/** Permission keys use shop.* (not shops.*) per keys.ts */
export const OPS_NAV_ITEMS: OpsNavItem[] = [
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    href: "/employee/ops",
    match: (p) => p === "/employee/ops" || p === "/employee/dashboard",
    permissions: ["reports.view_own", "reports.view_shop", "reports.view_company"],
  },
  {
    id: "my_attendance",
    labelKey: "employee.nav.attendance",
    href: "/employee/attendance",
    match: (p) => p === "/employee/attendance",
    permissions: ["attendance.view_own"],
    personal: true,
  },
  {
    id: "attendance",
    labelKey: "nav.attendance",
    href: "/employee/ops/attendance",
    match: (p) => p.startsWith("/employee/ops/attendance"),
    permissions: ["attendance.view_shop", "attendance.view_all", "attendance.view_own"],
  },
  {
    id: "schedule",
    labelKey: "nav.schedule",
    href: "/employee/ops/schedule",
    match: (p) => p.startsWith("/employee/ops/schedule"),
    permissions: [
      "schedule.view_shop",
      "schedule.view_own",
      "schedule.create",
      "schedule.edit",
    ],
  },
  {
    id: "shops",
    labelKey: "nav.shops",
    href: "/employee/ops/shops",
    match: (p) => p.startsWith("/employee/ops/shops"),
    permissions: [
      "shop.view_assigned",
      "shop.view_all",
      "shop.manage_assigned",
      "shop.manage_all",
    ],
  },
  {
    id: "employees",
    labelKey: "nav.employees",
    href: "/employee/ops/staff",
    match: (p) => p.startsWith("/employee/ops/staff"),
    permissions: [
      "staff.view",
      "staff.add",
      "staff.edit",
      "staff.manage_permissions",
    ],
  },
  {
    id: "my_tasks",
    labelKey: "employee.nav.tasks",
    href: "/employee/tasks",
    match: (p) => p === "/employee/tasks",
    permissions: ["tasks.view_own", "tasks.submit_proof"],
    personal: true,
  },
  {
    id: "tasks",
    labelKey: "nav.tasks",
    href: "/employee/ops/tasks",
    match: (p) => p.startsWith("/employee/ops/tasks"),
    permissions: [
      "tasks.view_shop",
      "tasks.create",
      "tasks.assign",
      "tasks.verify_proof",
      "tasks.approve",
    ],
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    href: "/employee/ops/settings",
    match: (p) => p.startsWith("/employee/ops/settings"),
    permissions: [
      "admin.company_profile",
      "admin.system_settings",
      "admin.security_settings",
    ],
  },
  {
    id: "billing",
    labelKey: "nav.billing",
    href: "/employee/ops/billing",
    match: (p) => p.startsWith("/employee/ops/billing"),
    permissions: ["admin.billing", "admin.subscription"],
  },
  {
    id: "notifications",
    labelKey: "employee.nav.notifications",
    href: "/employee/notifications",
    match: (p) => p.startsWith("/employee/notifications"),
    permissions: [],
    personal: true,
  },
  {
    id: "clock",
    labelKey: "employee.nav.clock",
    href: "/employee/clock",
    match: (p) => p.startsWith("/employee/clock"),
    permissions: [],
    personal: true,
  },
  {
    id: "account_settings",
    labelKey: "employee.nav.account",
    href: "/employee/settings",
    match: (p) => p.startsWith("/employee/settings"),
    permissions: [],
    personal: true,
  },
];

export const OPS_MODULE_PERMISSIONS: Record<
  Exclude<
    OpsModuleId,
    "clock" | "notifications" | "my_tasks" | "my_attendance" | "account_settings"
  >,
  PermissionKey[]
> = {
  dashboard: ["reports.view_own", "reports.view_shop", "reports.view_company"],
  attendance: ["attendance.view_shop", "attendance.view_all", "attendance.view_own"],
  schedule: ["schedule.view_shop", "schedule.view_own", "schedule.create", "schedule.edit"],
  shops: ["shop.view_assigned", "shop.view_all", "shop.manage_assigned", "shop.manage_all"],
  employees: ["staff.view", "staff.add", "staff.edit", "staff.manage_permissions"],
  tasks: [
    "tasks.view_shop",
    "tasks.create",
    "tasks.assign",
    "tasks.verify_proof",
    "tasks.approve",
  ],
  settings: ["admin.company_profile", "admin.system_settings", "admin.security_settings"],
  billing: ["admin.billing", "admin.subscription"],
};

export function canViewModuleFromPermissions(
  moduleId: OpsModuleId,
  permissions: Record<string, boolean>,
): boolean {
  const item = OPS_NAV_ITEMS.find((n) => n.id === moduleId);
  if (!item) return false;
  if (item.personal) return true;
  if (item.permissions.length === 0) return true;
  return item.permissions.some((key) => permissions[key] === true);
}

export function filterNavByPermissions(
  permissions: Record<string, boolean>,
): OpsNavItem[] {
  return OPS_NAV_ITEMS.filter((item) => {
    if (item.personal) return true;
    if (item.permissions.length === 0) return true;
    return item.permissions.some((key) => permissions[key] === true);
  });
}
