import type { PermissionGroup, PermissionKey, RoleTemplate } from "@/lib/permissions/keys";

/** Business role ladder (Company Admin = portal login, not staff profile). */
export const ROLE_HIERARCHY: Array<{
  id: RoleTemplate | "company_admin";
  level: number;
}> = [
  { id: "staff", level: 1 },
  { id: "supervisor", level: 2 },
  { id: "store_manager", level: 3 },
  { id: "area_manager", level: 4 },
  { id: "company_admin", level: 5 },
];

/** Shown in the main permissions panel (business-friendly, not exhaustive). */
export const RECOMMENDED_PERMISSION_GROUPS: PermissionGroup[] = [
  "attendance",
  "schedule",
  "tasks",
  "reports",
];

export const ADVANCED_PERMISSION_GROUPS: PermissionGroup[] = ["shop", "staff", "admin"];

/** Subset highlighted per group in the simple view. */
export const RECOMMENDED_PERMISSION_KEYS: Partial<Record<PermissionGroup, PermissionKey[]>> = {
  attendance: ["attendance.view_own", "attendance.view_shop", "attendance.export"],
  schedule: ["schedule.view_own", "schedule.create", "schedule.edit"],
  tasks: ["tasks.submit_proof", "tasks.verify_proof", "tasks.assign"],
  reports: ["reports.view_shop", "reports.view_area", "reports.shop_health"],
};

/** Roles that may verify tasks when they have shop access (even without explicit override). */
export const VERIFIER_ROLE_TEMPLATES: RoleTemplate[] = [
  "supervisor",
  "store_manager",
  "area_manager",
];

/** Build nested i18n path: permissions.keyLabels.tasks.submit_proof */
export function permissionLabelKey(key: PermissionKey): string {
  const dot = key.indexOf(".");
  if (dot < 0) return `permissions.keyLabels.${key}`;
  const group = key.slice(0, dot);
  const action = key.slice(dot + 1);
  return `permissions.keyLabels.${group}.${action}`;
}
