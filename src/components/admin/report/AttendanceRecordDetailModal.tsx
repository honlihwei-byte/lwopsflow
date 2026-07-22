"use client";

import type { AttendanceRecord } from "@/lib/attendance";
import { formatGpsDistanceMeters } from "@/lib/attendance";
import { gpsDisplayStatus } from "@/lib/gps-display-status";
import { recordEventDate, recordEventTime } from "@/lib/attendance-db";
import {
  selfieStatusForRecord,
  selfieStatusLabel,
} from "@/lib/selfie-attendance-status";
import { formatMalaysiaRecordedAt } from "@/lib/malaysia-time";
import { SelfieAttendanceCell } from "@/components/admin/report/SelfieAttendanceCell";
import { PhotoProofLink } from "@/components/admin/report/PhotoProofLink";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { translateGpsDisplayStatus, translatePunchAction } from "@/lib/i18n/attendance-ui";

type Props = {
  record: AttendanceRecord;
  clockIn?: AttendanceRecord | null;
  clockOut?: AttendanceRecord | null;
  onClose: () => void;
};

export function AttendanceRecordDetailModal({
  record,
  clockIn,
  clockOut,
  onClose,
}: Props) {
  const { t } = useI18n();
  const gpsStatus = gpsDisplayStatus(record);
  const selfieStatus = selfieStatusForRecord(record);
  const selfieLabel = selfieStatusLabel(selfieStatus);

  function punchLine(r: AttendanceRecord | null | undefined, label: string) {
    if (!r) return <p className="text-sm text-slate-500">{label}: —</p>;
    return (
      <p className="text-sm text-slate-800">
        <span className="font-medium text-slate-600">{label}:</span>{" "}
        {recordEventDate(r)} {recordEventTime(r)}
        <span className="ml-2 text-xs text-slate-500">
          ({translatePunchAction(t, r.action_type)})
        </span>
      </p>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-50">
            {t("attendance.recordModal.title")}
          </h2>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold"
            onClick={onClose}
          >
            {t("attendance.buttons.close")}
          </button>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-slate-500">{t("attendance.recordModal.staff")}</dt>
            <dd className="font-medium text-slate-900">
              {record.staff_name}{" "}
              <span className="text-slate-500">({record.staff_code})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">{t("attendance.recordModal.shop")}</dt>
            <dd>{record.shop_name}</dd>
          </div>
          <div className="space-y-1 border-t border-slate-100 pt-2">
            {punchLine(
              clockIn ?? (record.action_type === "clock_in" ? record : null),
              t("attendance.recordModal.clockIn"),
            )}
            {punchLine(
              clockOut ?? (record.action_type === "clock_out" ? record : null),
              t("attendance.recordModal.clockOut"),
            )}
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">{t("attendance.recordModal.gpsStatus")}</dt>
            <dd>
              {translateGpsDisplayStatus(t, gpsStatus)}
              {record.distance_from_shop_meters != null ? (
                <span className="ml-2 text-slate-500">
                  · {formatGpsDistanceMeters(record.distance_from_shop_meters)}
                </span>
              ) : null}
              {record.gps_accuracy_meters != null ? (
                <span className="ml-2 text-slate-500">· ±{Math.round(record.gps_accuracy_meters)}m</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">{t("attendance.recordModal.selfieStatus")}</dt>
            <dd>{selfieLabel}</dd>
            {record.selfie_proof_path ? (
              <dd className="mt-0.5 break-all font-mono text-[10px] text-slate-400">
                {record.selfie_proof_path}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">{t("attendance.recordModal.recorded")}</dt>
            <dd>{formatMalaysiaRecordedAt(record.created_at)}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          {selfieStatus !== "none" ? (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">{t("attendance.recordModal.selfie")}</p>
              <SelfieAttendanceCell record={record} />
            </div>
          ) : null}
          {record.photo_proof_used ? (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">{t("attendance.recordModal.photoProof")}</p>
              <PhotoProofLink attendanceId={record.id} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
