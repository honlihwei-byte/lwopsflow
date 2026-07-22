import { malaysiaDateYmd } from "@/lib/malaysia-time";
import {
  isStaffOpsItemComplete,
  isStaffOpsItemPending,
  opsRequirementsFromContent,
} from "@/lib/operations-center/completion";
import {
  isOpsContentVisibleToEmployees,
  opsContentDisplayStatus,
} from "@/lib/operations-center/lifecycle";
import {
  buildOperationsAttachmentPath,
  buildOperationsPhotoProofPath,
  isInlinePreviewMime,
  OPERATIONS_ALLOWED_MIME_TYPES,
  OPERATIONS_ATTACHMENT_MAX_BYTES,
  OPERATIONS_CONTENT_BUCKET,
  OPERATIONS_PROOF_MAX_BYTES,
  OPERATIONS_PROOF_MIME_TYPES,
  SIGNED_PREVIEW_TTL_SEC,
} from "@/lib/operations-center/storage";
import type {
  EmployeeOperationsFeedItem,
  EmployeeOperationsDetail,
  OperationsContentDetail,
  OperationsContentListItem,
  OperationsContentRow,
  OperationsContentStats,
  OperationsContentType,
  OperationsDashboardStats,
  OperationsReadTrackingRow,
  OperationsStatus,
} from "@/lib/operations-center/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type Supabase = ReturnType<typeof createAdminClient>;

type AckRow = {
  content_id: string;
  staff_id: string;
  shop_id: string;
  first_viewed_at: string | null;
  acknowledged_at: string | null;
  task_completed_at: string | null;
  photo_proof_path: string | null;
  photo_proof_uploaded_at: string | null;
};

function todayYmd(): string {
  return malaysiaDateYmd(new Date());
}

export async function listShopsForCompany(
  supabase: Supabase,
  companyId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from("shops")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ id: String(s.id), name: String(s.name) }));
}

export async function staffShopIds(supabase: Supabase, staffId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("staff_shop_assignments")
    .select("shop_id")
    .eq("staff_id", staffId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => String(r.shop_id));
}

export async function listEligibleStaffForContent(
  supabase: Supabase,
  companyId: string,
  targetAllShops: boolean,
  shopIds: string[],
): Promise<Array<{ id: string; staff_name: string; staff_code: string; shop_id: string; shop_name: string }>> {
  const allShops = await listShopsForCompany(supabase, companyId);
  const shopNameById = new Map(allShops.map((s) => [s.id, s.name]));
  const targetShopIds = targetAllShops ? allShops.map((s) => s.id) : shopIds;
  if (targetShopIds.length === 0) return [];

  const { data: assignments, error: assignErr } = await supabase
    .from("staff_shop_assignments")
    .select("staff_id, shop_id")
    .in("shop_id", targetShopIds);
  if (assignErr) throw new Error(assignErr.message);

  const staffIds = [...new Set((assignments ?? []).map((r) => String(r.staff_id)))];
  if (staffIds.length === 0) return [];

  const { data: staffRows, error: staffErr } = await supabase
    .from("staff")
    .select("id, staff_name, staff_code")
    .eq("company_id", companyId)
    .eq("status", "active")
    .in("id", staffIds);
  if (staffErr) throw new Error(staffErr.message);

  const assignmentByStaff = new Map<string, string>();
  for (const row of assignments ?? []) {
    assignmentByStaff.set(String(row.staff_id), String(row.shop_id));
  }

  return (staffRows ?? []).map((s) => {
    const shopId = assignmentByStaff.get(String(s.id)) ?? targetShopIds[0]!;
    return {
      id: String(s.id),
      staff_name: String(s.staff_name),
      staff_code: String(s.staff_code),
      shop_id: shopId,
      shop_name: shopNameById.get(shopId) ?? shopId,
    };
  });
}

async function countEligibleStaff(
  supabase: Supabase,
  companyId: string,
  targetAllShops: boolean,
  shopIds: string[],
): Promise<number> {
  const staff = await listEligibleStaffForContent(supabase, companyId, targetAllShops, shopIds);
  return staff.length;
}

async function loadContentShopMap(
  supabase: Supabase,
  contentIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (contentIds.length === 0) return map;

  const { data, error } = await supabase
    .from("operations_content_shops")
    .select("content_id, shop_id")
    .in("content_id", contentIds);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const cid = String(row.content_id);
    const list = map.get(cid) ?? [];
    list.push(String(row.shop_id));
    map.set(cid, list);
  }
  return map;
}

async function loadAckRowsForContent(
  supabase: Supabase,
  contentIds: string[],
): Promise<Map<string, AckRow[]>> {
  const map = new Map<string, AckRow[]>();
  if (contentIds.length === 0) return map;

  const { data, error } = await supabase
    .from("operations_acknowledgements")
    .select(
      "content_id, staff_id, shop_id, first_viewed_at, acknowledged_at, task_completed_at, photo_proof_path, photo_proof_uploaded_at",
    )
    .in("content_id", contentIds);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const cid = String(row.content_id);
    const list = map.get(cid) ?? [];
    list.push({
      content_id: cid,
      staff_id: String(row.staff_id),
      shop_id: String(row.shop_id),
      first_viewed_at: row.first_viewed_at ? String(row.first_viewed_at) : null,
      acknowledged_at: row.acknowledged_at ? String(row.acknowledged_at) : null,
      task_completed_at: row.task_completed_at ? String(row.task_completed_at) : null,
      photo_proof_path: row.photo_proof_path ? String(row.photo_proof_path) : null,
      photo_proof_uploaded_at: row.photo_proof_uploaded_at
        ? String(row.photo_proof_uploaded_at)
        : null,
    });
    map.set(cid, list);
  }
  return map;
}

function computeContentStats(
  row: OperationsContentRow,
  ackRows: AckRow[],
  totalRecipients: number,
): OperationsContentStats {
  const req = opsRequirementsFromContent(row);
  let read_count = 0;
  let acknowledged_count = 0;
  let task_completed_count = 0;
  let complete_count = 0;

  for (const ack of ackRows) {
    if (ack.first_viewed_at) read_count += 1;
    if (ack.acknowledged_at) acknowledged_count += 1;
    if (ack.task_completed_at) task_completed_count += 1;
    if (isStaffOpsItemComplete(req, ack)) complete_count += 1;
  }

  return {
    total_recipients: totalRecipients,
    read_count,
    acknowledged_count,
    task_completed_count,
    pending_count: Math.max(0, totalRecipients - complete_count),
  };
}

async function loadAttachmentCounts(
  supabase: Supabase,
  contentIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (contentIds.length === 0) return map;

  const { data, error } = await supabase
    .from("operations_attachments")
    .select("content_id")
    .in("content_id", contentIds);
  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const cid = String(row.content_id);
    map.set(cid, (map.get(cid) ?? 0) + 1);
  }
  return map;
}

async function signedStorageUrl(
  supabase: Supabase,
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(OPERATIONS_CONTENT_BUCKET)
    .createSignedUrl(storagePath, SIGNED_PREVIEW_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

function mapContentRow(row: Record<string, unknown>): OperationsContentRow {
  const effective_date = String(row.effective_date ?? row.publish_date ?? "");
  const publish_date = String(row.publish_date ?? row.effective_date ?? "");
  const end_date =
    row.end_date != null
      ? String(row.end_date)
      : row.expiry_date != null
        ? String(row.expiry_date)
        : null;
  const base = {
    id: String(row.id),
    company_id: String(row.company_id),
    title: String(row.title),
    description: String(row.description ?? ""),
    content_type: String(row.content_type) as OperationsContentType,
    target_all_shops: Boolean(row.target_all_shops),
    require_acknowledgement: Boolean(row.require_acknowledgement),
    require_task_completion: Boolean(row.require_task_completion),
    require_photo_proof: Boolean(row.require_photo_proof),
    publish_date,
    effective_date,
    end_date,
    status: String(row.status) as OperationsStatus,
    created_by: String(row.created_by ?? ""),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
  return {
    ...base,
    display_status: opsContentDisplayStatus(base),
  };
}

export type ListOperationsFilters = {
  shop_id?: string;
  content_type?: OperationsContentType;
  status?: OperationsStatus;
};

export async function listOperationsContent(
  supabase: Supabase,
  companyId: string,
  filters: ListOperationsFilters = {},
): Promise<OperationsContentListItem[]> {
  let query = supabase
    .from("operations_content")
    .select("*")
    .eq("company_id", companyId)
    .order("publish_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filters.content_type) query = query.eq("content_type", filters.content_type);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []).map(mapContentRow);
  const contentIds = rows.map((r) => r.id);

  const [shopMap, ackMap, attachMap, shops] = await Promise.all([
    loadContentShopMap(supabase, contentIds),
    loadAckRowsForContent(supabase, contentIds),
    loadAttachmentCounts(supabase, contentIds),
    listShopsForCompany(supabase, companyId),
  ]);
  const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

  if (filters.shop_id) {
    rows = rows.filter((row) => {
      if (row.target_all_shops) return true;
      return (shopMap.get(row.id) ?? []).includes(filters.shop_id!);
    });
  }

  const items: OperationsContentListItem[] = [];
  for (const row of rows) {
    const shopIds = row.target_all_shops ? shops.map((s) => s.id) : (shopMap.get(row.id) ?? []);
    const eligible = await countEligibleStaff(supabase, companyId, row.target_all_shops, shopIds);
    const stats = computeContentStats(row, ackMap.get(row.id) ?? [], eligible);
    items.push({
      ...row,
      shop_ids: shopIds,
      shop_names: shopIds.map((id) => shopNameById.get(id) ?? id),
      attachment_count: attachMap.get(row.id) ?? 0,
      ...stats,
    });
  }
  return items;
}

async function buildReadTracking(
  supabase: Supabase,
  companyId: string,
  row: OperationsContentRow,
  shopIds: string[],
  ackRows: AckRow[],
): Promise<OperationsReadTrackingRow[]> {
  const eligible = await listEligibleStaffForContent(
    supabase,
    companyId,
    row.target_all_shops,
    shopIds,
  );
  const ackByStaff = new Map(ackRows.map((a) => [a.staff_id, a]));
  const req = opsRequirementsFromContent(row);

  return Promise.all(
    eligible.map(async (staff) => {
      const ack = ackByStaff.get(staff.id);
      const photo_proof_url = ack?.photo_proof_path
        ? await signedStorageUrl(supabase, ack.photo_proof_path)
        : null;
      return {
        staff_id: staff.id,
        staff_name: staff.staff_name,
        staff_code: staff.staff_code,
        shop_id: ack?.shop_id ?? staff.shop_id,
        shop_name: staff.shop_name,
        first_viewed_at: ack?.first_viewed_at ?? null,
        acknowledged_at: ack?.acknowledged_at ?? null,
        task_completed_at: ack?.task_completed_at ?? null,
        photo_proof_uploaded_at: ack?.photo_proof_uploaded_at ?? null,
        photo_proof_url,
        is_pending: isStaffOpsItemPending(req, ack),
      };
    }),
  );
}

export async function getOperationsContentDetail(
  supabase: Supabase,
  companyId: string,
  contentId: string,
): Promise<OperationsContentDetail | null> {
  const { data, error } = await supabase
    .from("operations_content")
    .select("*")
    .eq("id", contentId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = mapContentRow(data);
  const shops = await listShopsForCompany(supabase, companyId);
  const shopMap = await loadContentShopMap(supabase, [contentId]);
  const shopIds = row.target_all_shops ? shops.map((s) => s.id) : (shopMap.get(contentId) ?? []);
  const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

  const { data: attachments, error: attErr } = await supabase
    .from("operations_attachments")
    .select("*")
    .eq("content_id", contentId)
    .order("sort_order")
    .order("created_at");
  if (attErr) throw new Error(attErr.message);

  const enriched = await Promise.all(
    (attachments ?? []).map(async (a) => {
      const mime = String(a.mime_type);
      const storage_path = String(a.storage_path);
      const signed = await signedStorageUrl(supabase, storage_path);
      return {
        id: String(a.id),
        content_id: String(a.content_id),
        file_name: String(a.file_name),
        mime_type: mime,
        storage_path,
        file_size: Number(a.file_size ?? 0),
        sort_order: Number(a.sort_order ?? 0),
        created_at: String(a.created_at),
        preview_url: isInlinePreviewMime(mime) ? signed : null,
        download_url: signed,
      };
    }),
  );

  const ackRows = (await loadAckRowsForContent(supabase, [contentId])).get(contentId) ?? [];
  const eligible = await countEligibleStaff(supabase, companyId, row.target_all_shops, shopIds);
  const stats = computeContentStats(row, ackRows, eligible);
  const read_tracking = await buildReadTracking(supabase, companyId, row, shopIds, ackRows);

  return {
    ...row,
    shop_ids: shopIds,
    shop_names: shopIds.map((id) => shopNameById.get(id) ?? id),
    attachments: enriched,
    read_tracking,
    ...stats,
  };
}

export type CreateOperationsContentInput = {
  title: string;
  description?: string;
  content_type: OperationsContentType;
  target_all_shops: boolean;
  shop_ids: string[];
  require_acknowledgement: boolean;
  require_task_completion: boolean;
  require_photo_proof: boolean;
  publish_date: string;
  effective_date: string;
  end_date?: string | null;
  status: OperationsStatus;
  created_by: string;
};

export async function createOperationsContent(
  supabase: Supabase,
  companyId: string,
  input: CreateOperationsContentInput,
): Promise<OperationsContentRow> {
  const { data, error } = await supabase
    .from("operations_content")
    .insert({
      company_id: companyId,
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      content_type: input.content_type,
      target_all_shops: input.target_all_shops,
      require_acknowledgement: input.require_acknowledgement,
      require_task_completion: input.require_task_completion,
      require_photo_proof: input.require_photo_proof,
      publish_date: input.publish_date,
      effective_date: input.effective_date,
      end_date: input.end_date || null,
      status: input.status,
      created_by: input.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const row = mapContentRow(data);
  if (!input.target_all_shops && input.shop_ids.length > 0) {
    const { error: shopErr } = await supabase.from("operations_content_shops").insert(
      input.shop_ids.map((shop_id) => ({ content_id: row.id, shop_id })),
    );
    if (shopErr) throw new Error(shopErr.message);
  }
  return row;
}

export type UpdateOperationsContentInput = Partial<
  Omit<CreateOperationsContentInput, "created_by">
> & {
  shop_ids?: string[];
};

export async function updateOperationsContent(
  supabase: Supabase,
  companyId: string,
  contentId: string,
  input: UpdateOperationsContentInput,
): Promise<OperationsContentRow | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title != null) patch.title = input.title.trim();
  if (input.description != null) patch.description = input.description.trim();
  if (input.content_type != null) patch.content_type = input.content_type;
  if (input.target_all_shops != null) patch.target_all_shops = input.target_all_shops;
  if (input.require_acknowledgement != null) patch.require_acknowledgement = input.require_acknowledgement;
  if (input.require_task_completion != null) patch.require_task_completion = input.require_task_completion;
  if (input.require_photo_proof != null) patch.require_photo_proof = input.require_photo_proof;
  if (input.publish_date != null) patch.publish_date = input.publish_date;
  if (input.effective_date != null) patch.effective_date = input.effective_date;
  if (input.end_date !== undefined) patch.end_date = input.end_date || null;
  if (input.status != null) patch.status = input.status;

  const { data, error } = await supabase
    .from("operations_content")
    .update(patch)
    .eq("id", contentId)
    .eq("company_id", companyId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  if (input.shop_ids != null || input.target_all_shops != null) {
    await supabase.from("operations_content_shops").delete().eq("content_id", contentId);
    const targetAll = input.target_all_shops ?? Boolean(data.target_all_shops);
    const shopIds = input.shop_ids ?? [];
    if (!targetAll && shopIds.length > 0) {
      const { error: shopErr } = await supabase.from("operations_content_shops").insert(
        shopIds.map((shop_id) => ({ content_id: contentId, shop_id })),
      );
      if (shopErr) throw new Error(shopErr.message);
    }
  }

  return mapContentRow(data);
}

export async function deleteOperationsContent(
  supabase: Supabase,
  companyId: string,
  contentId: string,
): Promise<boolean> {
  const { data: attachments } = await supabase
    .from("operations_attachments")
    .select("storage_path")
    .eq("content_id", contentId);

  const { error } = await supabase
    .from("operations_content")
    .delete()
    .eq("id", contentId)
    .eq("company_id", companyId);
  if (error) throw new Error(error.message);

  const paths = (attachments ?? []).map((a) => String(a.storage_path)).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from(OPERATIONS_CONTENT_BUCKET).remove(paths);
  }
  return true;
}

export async function uploadOperationsAttachment(
  supabase: Supabase,
  params: {
    companyId: string;
    contentId: string;
    file: File | Blob;
    fileName: string;
    mimeType: string;
  },
): Promise<{ id: string; preview_url: string | null; download_url: string | null }> {
  const mime = params.mimeType.toLowerCase();
  if (!OPERATIONS_ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error("Unsupported file type.");
  }
  if (params.file.size > OPERATIONS_ATTACHMENT_MAX_BYTES) {
    throw new Error("File too large (max 10MB).");
  }

  const storagePath = buildOperationsAttachmentPath(
    params.companyId,
    params.contentId,
    mime,
    params.fileName,
  );
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(OPERATIONS_CONTENT_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data: sortRows } = await supabase
    .from("operations_attachments")
    .select("sort_order")
    .eq("content_id", params.contentId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = sortRows?.[0]?.sort_order != null ? Number(sortRows[0].sort_order) + 1 : 0;

  const { data, error } = await supabase
    .from("operations_attachments")
    .insert({
      content_id: params.contentId,
      file_name: params.fileName,
      mime_type: mime,
      storage_path: storagePath,
      file_size: params.file.size,
      sort_order: nextSort,
    })
    .select("id, storage_path, mime_type")
    .single();
  if (error) throw new Error(error.message);

  const signed = await signedStorageUrl(supabase, String(data.storage_path));
  return {
    id: String(data.id),
    preview_url: isInlinePreviewMime(mime) ? signed : null,
    download_url: signed,
  };
}

function contentVisibleToStaffShops(
  row: OperationsContentRow,
  contentShopIds: string[],
  staffShopIdsList: string[],
): boolean {
  if (row.target_all_shops) return staffShopIdsList.length > 0;
  return contentShopIds.some((id) => staffShopIdsList.includes(id));
}

function mapAckToFeedState(ack: AckRow | undefined, row: OperationsContentRow) {
  const req = opsRequirementsFromContent(row);
  return {
    is_read: Boolean(ack?.first_viewed_at),
    is_acknowledged: Boolean(ack?.acknowledged_at),
    is_task_completed: Boolean(ack?.task_completed_at),
    has_photo_proof: Boolean(ack?.photo_proof_path),
    is_pending: isStaffOpsItemPending(req, ack),
  };
}

function sortEmployeeFeed(items: EmployeeOperationsFeedItem[]): EmployeeOperationsFeedItem[] {
  return [...items].sort((a, b) => {
    if (a.is_pending !== b.is_pending) return a.is_pending ? -1 : 1;
    if (a.publish_date !== b.publish_date) return b.publish_date.localeCompare(a.publish_date);
    return b.id.localeCompare(a.id);
  });
}

export async function listEmployeeOperationsFeed(
  supabase: Supabase,
  params: { companyId: string; staffId: string; shopId?: string | null },
): Promise<EmployeeOperationsFeedItem[]> {
  const day = todayYmd();
  const assignedShopIds = await staffShopIds(supabase, params.staffId);
  if (assignedShopIds.length === 0) return [];

  const { data, error } = await supabase
    .from("operations_content")
    .select("*")
    .eq("company_id", params.companyId)
    .eq("status", "published")
    .lte("publish_date", day)
    .or(`end_date.is.null,end_date.gte.${day}`);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map(mapContentRow);
  const contentIds = rows.map((r) => r.id);
  const [shopMap, attachRows, ackByContentAll] = await Promise.all([
    loadContentShopMap(supabase, contentIds),
    supabase
      .from("operations_attachments")
      .select("id, content_id, mime_type, storage_path, sort_order")
      .in("content_id", contentIds)
      .order("sort_order")
      .order("created_at"),
    loadAckRowsForContent(supabase, contentIds),
  ]);
  if (attachRows.error) throw new Error(attachRows.error.message);

  const staffAckByContent = new Map<string, AckRow>();
  for (const [cid, list] of ackByContentAll.entries()) {
    const mine = list.find((a) => a.staff_id === params.staffId);
    if (mine) staffAckByContent.set(cid, mine);
  }

  const firstAttachByContent = new Map<string, (typeof attachRows.data)[number]>();
  for (const a of attachRows.data ?? []) {
    const cid = String(a.content_id);
    if (!firstAttachByContent.has(cid)) firstAttachByContent.set(cid, a);
  }

  const feed: EmployeeOperationsFeedItem[] = [];
  for (const row of rows) {
    const contentShops = shopMap.get(row.id) ?? [];
    if (!contentVisibleToStaffShops(row, contentShops, assignedShopIds)) continue;
    if (params.shopId && !row.target_all_shops && !contentShops.includes(params.shopId)) {
      if (!assignedShopIds.includes(params.shopId)) continue;
    }

    const ack = staffAckByContent.get(row.id);
    const firstAttach = firstAttachByContent.get(row.id);
    let preview_attachment: EmployeeOperationsFeedItem["preview_attachment"] = null;
    if (firstAttach) {
      preview_attachment = {
        id: String(firstAttach.id),
        mime_type: String(firstAttach.mime_type),
        preview_url: isInlinePreviewMime(String(firstAttach.mime_type))
          ? await signedStorageUrl(supabase, String(firstAttach.storage_path))
          : null,
      };
    }

    const attachCount = (attachRows.data ?? []).filter((a) => String(a.content_id) === row.id).length;
    feed.push({
      id: row.id,
      title: row.title,
      description: row.description,
      content_type: row.content_type,
      publish_date: row.publish_date,
      effective_date: row.effective_date,
      end_date: row.end_date,
      display_status: row.display_status,
      require_acknowledgement: row.require_acknowledgement,
      require_task_completion: row.require_task_completion,
      require_photo_proof: row.require_photo_proof,
      attachment_count: attachCount,
      ...mapAckToFeedState(ack, row),
      preview_attachment,
    });
  }
  return sortEmployeeFeed(feed);
}

export async function getEmployeeOperationsDetail(
  supabase: Supabase,
  params: { companyId: string; staffId: string; contentId: string; shopId: string },
): Promise<EmployeeOperationsDetail | null> {
  const detail = await getOperationsContentDetail(supabase, params.companyId, params.contentId);
  if (!detail || !isOpsContentVisibleToEmployees(detail, todayYmd())) {
    return null;
  }

  const assigned = await staffShopIds(supabase, params.staffId);
  if (!contentVisibleToStaffShops(detail, detail.shop_ids, assigned)) return null;

  const ackRows = (await loadAckRowsForContent(supabase, [params.contentId])).get(params.contentId) ?? [];
  const ack = ackRows.find((a) => a.staff_id === params.staffId);
  const state = mapAckToFeedState(ack, detail);
  const my_photo_proof_url = ack?.photo_proof_path
    ? await signedStorageUrl(supabase, ack.photo_proof_path)
    : null;

  return {
    ...detail,
    read_tracking: [],
    ...state,
    my_photo_proof_url,
  };
}

export async function recordOperationsView(
  supabase: Supabase,
  params: {
    contentId: string;
    staffId: string;
    shopId: string;
    deviceInfo?: string | null;
    content: OperationsContentRow;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const req = opsRequirementsFromContent(params.content);
  const needsExplicitComplete =
    req.require_acknowledgement || req.require_task_completion || req.require_photo_proof;

  const { data: existing } = await supabase
    .from("operations_acknowledgements")
    .select("id, first_viewed_at, acknowledged_at, task_completed_at, photo_proof_path")
    .eq("content_id", params.contentId)
    .eq("staff_id", params.staffId)
    .maybeSingle();

  if (existing) {
    if (!existing.first_viewed_at) {
      await supabase
        .from("operations_acknowledgements")
        .update({ first_viewed_at: now, device_info: params.deviceInfo ?? null })
        .eq("id", existing.id);
    }
    if (!needsExplicitComplete && !existing.acknowledged_at) {
      await supabase
        .from("operations_acknowledgements")
        .update({ acknowledged_at: now })
        .eq("id", existing.id);
    }
    return;
  }

  await supabase.from("operations_acknowledgements").insert({
    content_id: params.contentId,
    staff_id: params.staffId,
    shop_id: params.shopId,
    first_viewed_at: now,
    acknowledged_at: needsExplicitComplete ? null : now,
    device_info: params.deviceInfo ?? null,
  });
}

export async function acknowledgeOperationsContent(
  supabase: Supabase,
  params: {
    contentId: string;
    staffId: string;
    shopId: string;
    deviceInfo?: string | null;
    content: OperationsContentRow;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.content.require_photo_proof) {
    const { data: existing } = await supabase
      .from("operations_acknowledgements")
      .select("photo_proof_path")
      .eq("content_id", params.contentId)
      .eq("staff_id", params.staffId)
      .maybeSingle();
    if (!existing?.photo_proof_path) {
      return { ok: false, error: "Photo proof required before acknowledgement." };
    }
  }

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("operations_acknowledgements")
    .select("id")
    .eq("content_id", params.contentId)
    .eq("staff_id", params.staffId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("operations_acknowledgements")
      .update({
        acknowledged_at: now,
        shop_id: params.shopId,
        device_info: params.deviceInfo ?? null,
      })
      .eq("id", existing.id);
    return { ok: true };
  }

  await supabase.from("operations_acknowledgements").insert({
    content_id: params.contentId,
    staff_id: params.staffId,
    shop_id: params.shopId,
    first_viewed_at: now,
    acknowledged_at: now,
    device_info: params.deviceInfo ?? null,
  });
  return { ok: true };
}

export async function completeOperationsTask(
  supabase: Supabase,
  params: {
    contentId: string;
    staffId: string;
    shopId: string;
    deviceInfo?: string | null;
    content: OperationsContentRow;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("operations_acknowledgements")
    .select("id, first_viewed_at")
    .eq("content_id", params.contentId)
    .eq("staff_id", params.staffId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("operations_acknowledgements")
      .update({
        task_completed_at: now,
        shop_id: params.shopId,
        first_viewed_at: existing.first_viewed_at ?? now,
        device_info: params.deviceInfo ?? null,
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("operations_acknowledgements").insert({
    content_id: params.contentId,
    staff_id: params.staffId,
    shop_id: params.shopId,
    first_viewed_at: now,
    task_completed_at: now,
    device_info: params.deviceInfo ?? null,
  });
}

export async function uploadOperationsPhotoProof(
  supabase: Supabase,
  params: {
    companyId: string;
    contentId: string;
    staffId: string;
    shopId: string;
    file: File | Blob;
    mimeType: string;
    deviceInfo?: string | null;
  },
): Promise<{ photo_proof_url: string | null }> {
  const mime = params.mimeType.toLowerCase();
  if (!OPERATIONS_PROOF_MIME_TYPES.has(mime)) {
    throw new Error("Photo proof must be JPG, PNG, or WebP.");
  }
  if (params.file.size > OPERATIONS_PROOF_MAX_BYTES) {
    throw new Error("Photo too large (max 5MB).");
  }

  const storagePath = buildOperationsPhotoProofPath(
    params.companyId,
    params.contentId,
    params.staffId,
    mime,
  );
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(OPERATIONS_CONTENT_BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (upErr) throw new Error(upErr.message);

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("operations_acknowledgements")
    .select("id, first_viewed_at")
    .eq("content_id", params.contentId)
    .eq("staff_id", params.staffId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("operations_acknowledgements")
      .update({
        photo_proof_path: storagePath,
        photo_proof_uploaded_at: now,
        shop_id: params.shopId,
        first_viewed_at: existing.first_viewed_at ?? now,
        device_info: params.deviceInfo ?? null,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("operations_acknowledgements").insert({
      content_id: params.contentId,
      staff_id: params.staffId,
      shop_id: params.shopId,
      first_viewed_at: now,
      photo_proof_path: storagePath,
      photo_proof_uploaded_at: now,
      device_info: params.deviceInfo ?? null,
    });
  }

  return { photo_proof_url: await signedStorageUrl(supabase, storagePath) };
}

export async function getOperationsDashboardStats(
  supabase: Supabase,
  companyId: string,
  filters: ListOperationsFilters = {},
): Promise<OperationsDashboardStats> {
  const items = await listOperationsContent(supabase, companyId, {
    ...filters,
    status: filters.status ?? "published",
  });
  const published = items.filter((i) => i.status === "published");

  let totalRecipients = 0;
  let readCount = 0;
  let ackCount = 0;
  let pendingCount = 0;
  let ackEligible = 0;
  let totalAck = 0;

  for (const item of published) {
    totalRecipients += item.total_recipients;
    readCount += item.read_count;
    ackCount += item.acknowledged_count;
    pendingCount += item.pending_count;
    if (item.require_acknowledgement) {
      ackEligible += item.total_recipients;
      totalAck += item.acknowledged_count;
    }
  }

  return {
    total_published: published.length,
    total_recipients: totalRecipients,
    read_count: readCount,
    acknowledged_count: ackCount,
    pending_count: pendingCount,
    read_rate_pct:
      totalRecipients > 0 ? Math.round((readCount / totalRecipients) * 1000) / 10 : 0,
    acknowledgement_rate_pct:
      ackEligible > 0 ? Math.round((totalAck / ackEligible) * 1000) / 10 : null,
  };
}

export type EmployeeDashboardOpsSummary = {
  hub_title: string;
  total_unread: number;
  total_items: number;
  recent: EmployeeOperationsFeedItem[];
};

export async function getEmployeeDashboardOpsSummary(
  supabase: Supabase,
  params: { companyId: string; staffId: string },
): Promise<EmployeeDashboardOpsSummary> {
  const feed = await listEmployeeOperationsFeed(supabase, params);
  return {
    hub_title: "operations_hub",
    total_unread: feed.filter((f) => f.is_pending).length,
    total_items: feed.length,
    recent: feed.slice(0, 5),
  };
}
