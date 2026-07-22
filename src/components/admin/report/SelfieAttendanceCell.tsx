"use client";

import { useCallback, useRef, useState } from "react";
import type { AttendanceRecord } from "@/lib/attendance";
import { attachSelfieToAttendance } from "@/lib/selfie-background-upload";
import {
  loadPendingSelfieUpload,
  pendingSelfieToFile,
  savePendingSelfieUpload,
} from "@/lib/selfie-pending-store";
import {
  selfieStatusForRecord,
  selfieStatusLabel,
} from "@/lib/selfie-attendance-status";
import { SelfieThumbnail } from "@/components/admin/report/SelfieThumbnail";

type Props = {
  record: AttendanceRecord;
  onUpdated?: () => void;
};

export function SelfieAttendanceCell({ record, onUpdated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const status = selfieStatusForRecord(record);
  const label = selfieStatusLabel(status);

  const retryUpload = useCallback(
    async (file: File) => {
      setBusy(true);
      setLocalError(null);
      const result = await attachSelfieToAttendance(
        {
          attendanceId: record.id,
          shopId: record.shop_id,
          punchQrToken: "",
          file,
          staffId: record.staff_id,
        },
        undefined,
      );
      setBusy(false);
      if (!result.ok) {
        setLocalError(result.error);
        return;
      }
      onUpdated?.();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    },
    [onUpdated, record.id, record.shop_id, record.staff_id],
  );

  async function handleRetryClick() {
    const pending = loadPendingSelfieUpload(record.id);
    if (pending) {
      await retryUpload(pendingSelfieToFile(pending));
      return;
    }
    fileRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await savePendingSelfieUpload({
      attendanceId: record.id,
      shopId: record.shop_id,
      punchQrToken: "",
      staffId: record.staff_id,
      file,
    });
    await retryUpload(file);
  }

  if (record.selfie_proof_path) {
    return <SelfieThumbnail attendanceId={record.id} />;
  }

  if (status === "not_required") {
    return <span className="text-slate-500">{label}</span>;
  }

  if (status === "none") {
    return <span className="text-slate-400">—</span>;
  }

  if (status === "pending_upload" || status === "upload_failed") {
    return (
      <div className="flex flex-col gap-1">
        <span
          className={`text-[10px] font-medium ${
            status === "upload_failed" ? "text-red-700" : "text-amber-700"
          }`}
        >
          {status === "upload_failed" ? "Selfie upload failed" : label}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleRetryClick()}
          className="text-left text-[10px] font-semibold text-sky-700 underline disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Retry upload"}
        </button>
        {localError ? (
          <span className="text-[10px] text-red-600">{localError}</span>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          className="hidden"
          onChange={(e) => void handleFileChange(e)}
        />
      </div>
    );
  }

  return (
    <span className="text-[10px] font-medium text-slate-600">{label}</span>
  );
}
