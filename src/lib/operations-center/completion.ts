export type StaffOpsAckState = {
  first_viewed_at?: string | null;
  acknowledged_at?: string | null;
  task_completed_at?: string | null;
  photo_proof_path?: string | null;
};

export type OpsStaffRequirements = {
  require_acknowledgement: boolean;
  require_task_completion: boolean;
  require_photo_proof: boolean;
};

/** Staff still has an action pending (unread / incomplete). */
export function isStaffOpsItemPending(
  req: OpsStaffRequirements,
  ack: StaffOpsAckState | null | undefined,
): boolean {
  if (!ack?.first_viewed_at) return true;
  if (req.require_acknowledgement && !ack.acknowledged_at) return true;
  if (req.require_task_completion && !ack.task_completed_at) return true;
  if (req.require_photo_proof && !ack.photo_proof_path) return true;
  return false;
}

export function isStaffOpsItemComplete(
  req: OpsStaffRequirements,
  ack: StaffOpsAckState | null | undefined,
): boolean {
  return !isStaffOpsItemPending(req, ack);
}

export function opsRequirementsFromContent(row: {
  require_acknowledgement: boolean;
  require_task_completion: boolean;
  require_photo_proof: boolean;
}): OpsStaffRequirements {
  return {
    require_acknowledgement: row.require_acknowledgement,
    require_task_completion: row.require_task_completion,
    require_photo_proof: row.require_photo_proof,
  };
}
