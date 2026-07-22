import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type ShopShiftTemplateRow = {
  id: string;
  shop_id: string | null;
  company_id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function hhmm(v: string): string {
  const s = String(v ?? "").trim();
  return s.length >= 5 ? s.slice(0, 5) : "09:00";
}

function normalize(row: Record<string, unknown>): ShopShiftTemplateRow {
  return {
    id: String(row.id),
    shop_id: row.shop_id != null ? String(row.shop_id) : null,
    company_id: String(row.company_id),
    name: String(row.name),
    start_time: hhmm(String(row.start_time)),
    end_time: hhmm(String(row.end_time)),
    break_minutes: Number(row.break_minutes ?? 0) || 0,
    sort_order: Number(row.sort_order ?? 0) || 0,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

const SELECT =
  "id, shop_id, company_id, name, start_time, end_time, break_minutes, sort_order, created_at, updated_at";

export async function listShopShiftTemplates(
  supabase: Supabase,
  params: { companyId: string; shopId: string },
): Promise<ShopShiftTemplateRow[]> {
  const { data, error } = await supabase
    .from("shop_shift_templates")
    .select(SELECT)
    .eq("company_id", params.companyId)
    .or(`shop_id.is.null,shop_id.eq.${params.shopId}`)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => normalize(r as Record<string, unknown>));
}

export async function createShopShiftTemplate(
  supabase: Supabase,
  row: Omit<ShopShiftTemplateRow, "id" | "created_at" | "updated_at">,
): Promise<ShopShiftTemplateRow> {
  const { data, error } = await supabase
    .from("shop_shift_templates")
    .insert({
      ...row,
      start_time: hhmm(row.start_time),
      end_time: hhmm(row.end_time),
      updated_at: new Date().toISOString(),
    })
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create template");
  return normalize(data as Record<string, unknown>);
}

export async function updateShopShiftTemplate(
  supabase: Supabase,
  templateId: string,
  patch: Partial<Pick<ShopShiftTemplateRow, "name" | "start_time" | "end_time" | "break_minutes" | "sort_order">>,
): Promise<ShopShiftTemplateRow> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.start_time !== undefined) updates.start_time = hhmm(patch.start_time);
  if (patch.end_time !== undefined) updates.end_time = hhmm(patch.end_time);
  if (patch.break_minutes !== undefined) updates.break_minutes = patch.break_minutes;
  if (patch.sort_order !== undefined) updates.sort_order = patch.sort_order;

  const { data, error } = await supabase
    .from("shop_shift_templates")
    .update(updates)
    .eq("id", templateId)
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(error?.message || "Could not update template");
  return normalize(data as Record<string, unknown>);
}

export async function deleteShopShiftTemplate(supabase: Supabase, templateId: string): Promise<void> {
  const { error } = await supabase.from("shop_shift_templates").delete().eq("id", templateId);
  if (error) throw new Error(error.message);
}

export async function seedDefaultTemplatesForShop(
  supabase: Supabase,
  shopId: string,
  companyId: string,
): Promise<ShopShiftTemplateRow[]> {
  const existing = await listShopShiftTemplates(supabase, { companyId, shopId });
  if (existing.length > 0) return existing;

  const { DEFAULT_SHIFT_TEMPLATES } = await import("@/lib/shop-scheduling");
  const created: ShopShiftTemplateRow[] = [];
  for (let i = 0; i < DEFAULT_SHIFT_TEMPLATES.length; i++) {
    const t = DEFAULT_SHIFT_TEMPLATES[i]!;
    created.push(
      await createShopShiftTemplate(supabase, {
        company_id: companyId,
        shop_id: null,
        name: t.name,
        start_time: t.start_time,
        end_time: t.end_time,
        break_minutes: t.break_minutes,
        sort_order: i,
      }),
    );
  }
  return created;
}
