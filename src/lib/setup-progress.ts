import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type SetupChecklistItemId =
  | "create_shop"
  | "add_staff"
  | "configure_gps"
  | "create_shift_template"
  | "schedule_staff"
  | "first_attendance";

export type SetupChecklistItem = {
  id: SetupChecklistItemId;
  label: string;
  done: boolean;
  href: string;
};

export type SetupProgress = {
  items: SetupChecklistItem[];
  completed_count: number;
  total_count: number;
  percent_complete: number;
};

const CHECKLIST_META: { id: SetupChecklistItemId; label: string; href: string }[] = [
  { id: "create_shop", label: "Create Shop", href: "/admin/shops" },
  { id: "add_staff", label: "Add Staff", href: "/admin/staff" },
  { id: "configure_gps", label: "Configure GPS", href: "/admin/shops" },
  { id: "create_shift_template", label: "Create Shift Template", href: "/admin/shops" },
  { id: "schedule_staff", label: "Schedule Staff", href: "/admin/shops" },
  { id: "first_attendance", label: "First Attendance Recorded", href: "/admin" },
];

export async function computeCompanySetupProgress(
  supabase: Supabase,
  companyId: string,
): Promise<SetupProgress> {
  const { data: shops } = await supabase
    .from("shops")
    .select("id, latitude, longitude")
    .eq("company_id", companyId);

  const shopIds = (shops ?? []).map((s) => String(s.id));
  const hasShop = shopIds.length > 0;

  let hasGps = false;
  if (hasShop) {
    hasGps = (shops ?? []).some(
      (s) => typeof s.latitude === "number" && typeof s.longitude === "number",
    );
    if (!hasGps) {
      const { count } = await supabase
        .from("shop_gps_locations")
        .select("id", { count: "exact", head: true })
        .in("shop_id", shopIds);
      hasGps = (count ?? 0) > 0;
    }
  }

  const { count: staffCount } = await supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  let templateCount = 0;
  let scheduleCount = 0;
  if (shopIds.length > 0) {
    const [{ count: tpl }, { count: sched }] = await Promise.all([
      supabase
        .from("shop_shift_templates")
        .select("id", { count: "exact", head: true })
        .in("shop_id", shopIds),
      supabase
        .from("staff_schedules")
        .select("id", { count: "exact", head: true })
        .in("shop_id", shopIds),
    ]);
    templateCount = tpl ?? 0;
    scheduleCount = sched ?? 0;
  }

  let attendanceCount = 0;
  if (shopIds.length > 0) {
    const { count } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .in("shop_id", shopIds);
    attendanceCount = count ?? 0;
  }

  const doneMap: Record<SetupChecklistItemId, boolean> = {
    create_shop: hasShop,
    add_staff: (staffCount ?? 0) > 0,
    configure_gps: hasGps,
    create_shift_template: templateCount > 0,
    schedule_staff: scheduleCount > 0,
    first_attendance: (attendanceCount ?? 0) > 0,
  };

  const items: SetupChecklistItem[] = CHECKLIST_META.map((m) => ({
    ...m,
    done: doneMap[m.id],
  }));

  const completed_count = items.filter((i) => i.done).length;
  const total_count = items.length;
  const percent_complete =
    total_count === 0 ? 0 : Math.round((completed_count / total_count) * 100);

  return { items, completed_count, total_count, percent_complete };
}

export async function fetchCompanyOnboardingState(
  supabase: Supabase,
  companyId: string,
): Promise<{
  wizard_completed: boolean;
  wizard_skipped: boolean;
  show_wizard: boolean;
}> {
  const { data } = await supabase
    .from("companies")
    .select("onboarding_wizard_completed_at, onboarding_wizard_skipped")
    .eq("id", companyId)
    .maybeSingle();

  const wizard_completed = Boolean(data?.onboarding_wizard_completed_at);
  const wizard_skipped = data?.onboarding_wizard_skipped === true;
  const show_wizard = !wizard_completed && !wizard_skipped;

  return { wizard_completed, wizard_skipped, show_wizard };
}
