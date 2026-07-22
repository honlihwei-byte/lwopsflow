import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

export type TaskDuplicateCheckParams = {
  company_id: string;
  shop_id: string;
  title: string;
  due_date: string;
};

/** True when an active task row already exists for this shop + title + due date. */
export async function taskExistsForShopAndDate(
  supabase: Supabase,
  params: TaskDuplicateCheckParams,
): Promise<boolean> {
  const title = params.title.trim();
  if (!title) return false;

  const { data, error } = await supabase
    .from("retail_tasks")
    .select("id")
    .eq("company_id", params.company_id)
    .eq("shop_id", params.shop_id)
    .eq("due_date", params.due_date)
    .eq("title", title)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function findDuplicateShopsForTask(
  supabase: Supabase,
  params: {
    company_id: string;
    shop_ids: string[];
    title: string;
    due_date: string;
    shopNames: Map<string, string>;
  },
): Promise<Array<{ shop_id: string; shop_name: string }>> {
  const duplicates: Array<{ shop_id: string; shop_name: string }> = [];
  for (const shop_id of params.shop_ids) {
    const exists = await taskExistsForShopAndDate(supabase, {
      company_id: params.company_id,
      shop_id,
      title: params.title,
      due_date: params.due_date,
    });
    if (exists) {
      duplicates.push({
        shop_id,
        shop_name: params.shopNames.get(shop_id) ?? shop_id,
      });
    }
  }
  return duplicates;
}
