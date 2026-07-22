export const OPERATIONS_CONTENT_TYPES = [
  "announcement",
  "memo",
  "promotion",
  "sop",
  "training",
  "price_change",
  "emergency_notice",
] as const;

export const OPERATIONS_DISPLAY_STATUSES = [
  "draft",
  "published",
  "upcoming",
  "active",
  "ended",
  "archived",
] as const;

export type OperationsDisplayStatus = (typeof OPERATIONS_DISPLAY_STATUSES)[number];

export const OPERATIONS_LIFECYCLE_STATUSES = ["upcoming", "active", "ended"] as const;

export type OperationsLifecycleStatus = (typeof OPERATIONS_LIFECYCLE_STATUSES)[number];

export type OperationsContentType = (typeof OPERATIONS_CONTENT_TYPES)[number];

export const OPERATIONS_STATUSES = ["draft", "published", "archived"] as const;

export type OperationsStatus = (typeof OPERATIONS_STATUSES)[number];

export type OperationsAttachmentRow = {
  id: string;
  content_id: string;
  file_name: string;
  mime_type: string;
  storage_path: string;
  file_size: number;
  sort_order: number;
  created_at: string;
};

export type OperationsContentRow = {
  id: string;
  company_id: string;
  title: string;
  description: string;
  content_type: OperationsContentType;
  target_all_shops: boolean;
  require_acknowledgement: boolean;
  require_task_completion: boolean;
  require_photo_proof: boolean;
  publish_date: string;
  effective_date: string;
  end_date: string | null;
  display_status: OperationsDisplayStatus;
  status: OperationsStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type OperationsContentStats = {
  total_recipients: number;
  read_count: number;
  acknowledged_count: number;
  task_completed_count: number;
  pending_count: number;
};

export type OperationsContentListItem = OperationsContentRow & {
  shop_ids: string[];
  shop_names: string[];
  attachment_count: number;
} & OperationsContentStats;

export type OperationsReadTrackingRow = {
  staff_id: string;
  staff_name: string;
  staff_code: string;
  shop_id: string | null;
  shop_name: string | null;
  first_viewed_at: string | null;
  acknowledged_at: string | null;
  task_completed_at: string | null;
  photo_proof_uploaded_at: string | null;
  photo_proof_url: string | null;
  is_pending: boolean;
};

export type OperationsContentDetail = OperationsContentRow & {
  shop_ids: string[];
  shop_names: string[];
  attachments: Array<
    OperationsAttachmentRow & {
      preview_url: string | null;
      download_url: string | null;
    }
  >;
  read_tracking: OperationsReadTrackingRow[];
} & OperationsContentStats;

export type EmployeeOperationsDetail = OperationsContentDetail & {
  is_read: boolean;
  is_acknowledged: boolean;
  is_task_completed: boolean;
  has_photo_proof: boolean;
  is_pending: boolean;
  my_photo_proof_url: string | null;
};

export type EmployeeOperationsFeedItem = {
  id: string;
  title: string;
  description: string;
  content_type: OperationsContentType;
  publish_date: string;
  effective_date: string;
  end_date: string | null;
  display_status: OperationsDisplayStatus;
  require_acknowledgement: boolean;
  require_task_completion: boolean;
  require_photo_proof: boolean;
  attachment_count: number;
  is_read: boolean;
  is_acknowledged: boolean;
  is_task_completed: boolean;
  has_photo_proof: boolean;
  is_pending: boolean;
  preview_attachment: {
    id: string;
    mime_type: string;
    preview_url: string | null;
  } | null;
};

export type OperationsDashboardStats = {
  total_published: number;
  total_recipients: number;
  read_count: number;
  acknowledged_count: number;
  pending_count: number;
  read_rate_pct: number;
  acknowledgement_rate_pct: number | null;
};
