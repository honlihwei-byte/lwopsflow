import type { PermissionKey } from "@/lib/permissions/keys";
import {
  canViewModuleFromPermissions,
  type OpsModuleId,
} from "@/lib/permissions/nav-modules";

export type EmployeePermissionSnapshot = {
  effective_permissions: Record<string, boolean>;
  shop_scope: string;
  scope_shop_ids: string[];
  assigned_shop_ids: string[];
  role_template: string;
};

export function clientHasPermission(
  permissions: Record<string, boolean>,
  key: PermissionKey,
): boolean {
  return permissions[key] === true;
}

export function clientHasAnyPermission(
  permissions: Record<string, boolean>,
  keys: PermissionKey[],
): boolean {
  return keys.some((key) => permissions[key] === true);
}

export function clientCanAccessShop(
  snapshot: EmployeePermissionSnapshot,
  shopId: string,
): boolean {
  if (snapshot.shop_scope === "all_shops") return true;
  if (snapshot.shop_scope === "selected_shops") {
    return snapshot.scope_shop_ids.includes(shopId);
  }
  return snapshot.assigned_shop_ids.includes(shopId);
}

export function clientCanViewModule(
  snapshot: EmployeePermissionSnapshot,
  moduleId: OpsModuleId,
): boolean {
  return canViewModuleFromPermissions(moduleId, snapshot.effective_permissions);
}
