/** Flat permission keys — templates provide defaults; overrides per employee. */

export const PERMISSION_GROUPS = {
  shop: [
    "shop.view_assigned",
    "shop.view_all",
    "shop.manage_assigned",
    "shop.manage_all",
  ],
  staff: [
    "staff.view",
    "staff.add",
    "staff.edit",
    "staff.deactivate",
    "staff.assign_shop",
    "staff.change_role",
    "staff.manage_permissions",
  ],
  attendance: [
    "attendance.view_own",
    "attendance.view_shop",
    "attendance.view_all",
    "attendance.review_gps",
    "attendance.review_photo",
    "attendance.approve_manual",
    "attendance.export",
  ],
  schedule: [
    "schedule.view_own",
    "schedule.view_shop",
    "schedule.create",
    "schedule.edit",
    "schedule.mark_rest",
    "schedule.copy",
    "schedule.approve_changes",
  ],
  tasks: [
    "tasks.view_own",
    "tasks.view_shop",
    "tasks.create",
    "tasks.assign",
    "tasks.submit_proof",
    "tasks.verify_proof",
    "tasks.approve",
    "tasks.exception_submit",
    "tasks.exception_review",
    "tasks.view_history",
  ],
  reports: [
    "reports.view_own",
    "reports.view_shop",
    "reports.view_area",
    "reports.view_company",
    "reports.shop_health",
    "reports.staff_reliability",
    "reports.export",
  ],
  admin: [
    "admin.company_profile",
    "admin.billing",
    "admin.subscription",
    "admin.system_settings",
    "admin.security_settings",
  ],
} as const;

export type PermissionGroup = keyof typeof PERMISSION_GROUPS;

export const ALL_PERMISSION_KEYS = [
  ...PERMISSION_GROUPS.shop,
  ...PERMISSION_GROUPS.staff,
  ...PERMISSION_GROUPS.attendance,
  ...PERMISSION_GROUPS.schedule,
  ...PERMISSION_GROUPS.tasks,
  ...PERMISSION_GROUPS.reports,
  ...PERMISSION_GROUPS.admin,
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export const ROLE_TEMPLATES = [
  "area_manager",
  "store_manager",
  "supervisor",
  "staff",
] as const;

export type RoleTemplate = (typeof ROLE_TEMPLATES)[number];

export const SHOP_SCOPES = ["all_shops", "selected_shops", "assigned_only"] as const;
export type ShopScope = (typeof SHOP_SCOPES)[number];

export function isPermissionKey(v: string): v is PermissionKey {
  return (ALL_PERMISSION_KEYS as readonly string[]).includes(v);
}
