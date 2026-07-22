export const OPS_NOTIFICATION_TYPES = [
  "task_assigned",
  "task_due_soon",
  "task_overdue",
  "task_verified",
  "task_rejected",
  "schedule_updated",
  "attendance_exception",
] as const;

export type OpsNotificationType = (typeof OPS_NOTIFICATION_TYPES)[number];

export type TaskNotificationSettings = {
  notify_assigned_staff: boolean;
  notify_supervisor: boolean;
  notify_store_manager: boolean;
  reminder_offset_minutes: number | null;
};

export const DEFAULT_TASK_NOTIFICATION_SETTINGS: TaskNotificationSettings = {
  notify_assigned_staff: true,
  notify_supervisor: false,
  notify_store_manager: false,
  reminder_offset_minutes: null,
};

export const PUSH_ELIGIBLE_TYPES: OpsNotificationType[] = [
  "task_assigned",
  "task_due_soon",
  "task_overdue",
];
