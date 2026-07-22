import type { PermissionKey, RoleTemplate, ShopScope } from "@/lib/permissions/keys";

type TemplateDef = {
  shop_scope: ShopScope;
  permissions: Partial<Record<PermissionKey, boolean>>;
};

/** Default permission sets per role template (overridable per employee). */
export const ROLE_TEMPLATE_DEFAULTS: Record<RoleTemplate, TemplateDef> = {
  area_manager: {
    shop_scope: "selected_shops",
    permissions: {
      "shop.view_assigned": true,
      "shop.view_all": false,
      "shop.manage_assigned": true,
      "tasks.view_shop": true,
      "tasks.create": true,
      "tasks.assign": true,
      "tasks.submit_proof": true,
      "tasks.verify_proof": true,
      "tasks.approve": true,
      "tasks.exception_submit": true,
      "tasks.exception_review": true,
      "tasks.view_history": true,
      "attendance.view_shop": true,
      "schedule.view_shop": true,
      "reports.view_area": true,
      "reports.shop_health": true,
      "reports.staff_reliability": true,
    },
  },
  store_manager: {
    shop_scope: "assigned_only",
    permissions: {
      "shop.view_assigned": true,
      "shop.manage_assigned": true,
      "staff.view": true,
      "staff.add": false,
      "staff.edit": true,
      "staff.assign_shop": true,
      "tasks.view_shop": true,
      "tasks.create": true,
      "tasks.assign": true,
      "tasks.submit_proof": true,
      "tasks.verify_proof": true,
      "tasks.approve": true,
      "tasks.exception_submit": true,
      "tasks.exception_review": true,
      "tasks.view_history": true,
      "attendance.view_shop": true,
      "attendance.review_gps": true,
      "attendance.review_photo": true,
      "schedule.view_shop": true,
      "schedule.create": true,
      "schedule.edit": true,
      "schedule.mark_rest": true,
      "schedule.copy": true,
      "reports.view_shop": true,
      "reports.shop_health": true,
    },
  },
  supervisor: {
    shop_scope: "assigned_only",
    permissions: {
      "shop.view_assigned": true,
      "tasks.view_own": true,
      "tasks.view_shop": true,
      "tasks.submit_proof": true,
      "tasks.verify_proof": true,
      "tasks.approve": false,
      "tasks.exception_submit": true,
      "tasks.view_history": true,
      "attendance.view_shop": true,
      "schedule.view_shop": true,
      "schedule.view_own": true,
      "reports.view_shop": true,
    },
  },
  staff: {
    shop_scope: "assigned_only",
    permissions: {
      "shop.view_assigned": true,
      "tasks.view_own": true,
      "tasks.submit_proof": true,
      "tasks.exception_submit": true,
      "attendance.view_own": true,
      "schedule.view_own": true,
      "reports.view_own": true,
    },
  },
};

export function defaultShopScopeForTemplate(template: RoleTemplate): ShopScope {
  return ROLE_TEMPLATE_DEFAULTS[template].shop_scope;
}
