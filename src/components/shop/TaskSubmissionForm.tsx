"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { TaskProofCamera } from "@/components/shop/TaskProofCamera";
import { isChecklistComplete } from "@/lib/retail-tasks/task-checklist";
import { loadTaskDraft, saveTaskDraft } from "@/lib/retail-tasks/task-draft-client";
import {
  acquireTaskSubmitGps,
  isGpsLocationMissingError,
  prefillTaskGpsFromCache,
  readLocationPermissionState,
  type TaskGpsCoordinates,
} from "@/lib/retail-tasks/task-gps-client";
import { uploadTaskProofWithProgress } from "@/lib/retail-tasks/task-photo-upload-client";
import { formatTaskProofPhotoTimestamp } from "@/lib/retail-tasks/task-proof-photos";
import { minRequiredTaskPhotos } from "@/lib/retail-tasks/task-submission-rules";
import { taskWasOverdueAtSubmit } from "@/lib/retail-tasks/task-overdue";
import type { RetailTaskListItem, TaskProofPhotoRecord } from "@/lib/retail-tasks/types";

type UploadedPhoto = {
  photo: TaskProofPhotoRecord;
  previewUrl: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

export type TaskSubmitResult =
  | { ok: true }
  | { ok: false; message: string; code?: string };

type Props = {
  task: RetailTaskListItem;
  shopId: string;
  staffId: string;
  busy: boolean;
  onSubmit: (payload: {
    photo_urls: TaskProofPhotoRecord[];
    checklist?: Record<string, boolean>;
    comment?: string;
    overdue_reason?: string;
    staff_latitude?: number;
    staff_longitude?: number;
    gps_accuracy_meters?: number;
  }) => Promise<TaskSubmitResult>;
};

const COMMENT_DEBOUNCE_MS = 2000;
const SAVED_INDICATOR_MS = 2500;

export function TaskSubmissionForm({ task, shopId, staffId, busy, onSubmit }: Props) {
  const { t } = useI18n();
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<TaskGpsCoordinates | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsPromptVisible, setGpsPromptVisible] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState("");
  const [overdueReason, setOverdueReason] = useState("");
  const [overdueReasonError, setOverdueReasonError] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [autosaveAvailable, setAutosaveAvailable] = useState(true);

  const commentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photosRef = useRef(photos);
  const checklistRef = useRef(checklist);
  const commentRef = useRef(comment);

  photosRef.current = photos;
  checklistRef.current = checklist;
  commentRef.current = comment;

  const checklistItems = useMemo(
    () => [...(task.checklist_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [task.checklist_items],
  );
  const minPhotos = minRequiredTaskPhotos(task);
  const needsPhotos = minPhotos > 0;
  const isOverdueSubmit = taskWasOverdueAtSubmit(task.due_date, task.due_time);
  const allowGallery = task.photo_capture_mode === "camera_or_gallery";
  const gpsRequired = task.gps_required === true;

  useEffect(() => {
    if (!gpsRequired) return;

    const cached = prefillTaskGpsFromCache(task.id);
    if (cached) setGpsCoords(cached);

    let permissionStatus: PermissionStatus | null = null;

    void readLocationPermissionState().then((state) => {
      if (state === "granted" && !cached) {
        const retry = prefillTaskGpsFromCache(task.id);
        if (retry) setGpsCoords(retry);
      }
    });

    if (typeof navigator !== "undefined" && navigator.permissions) {
      void navigator.permissions.query({ name: "geolocation" }).then((status) => {
        permissionStatus = status;
        status.onchange = () => {
          if (status.state === "granted") {
            void acquireTaskSubmitGps(task.id, "preflight_cache")
              .then((coords) => setGpsCoords(coords))
              .catch(() => {
                /* user may still need to tap Get Location */
              });
          } else if (status.state === "denied") {
            setGpsCoords(null);
          }
        };
      });
    }

    return () => {
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [gpsRequired, task.id]);

  useEffect(() => {
    return () => {
      for (const p of photos) {
        if (p.previewUrl.startsWith("blob:")) URL.revokeObjectURL(p.previewUrl);
      }
      if (commentDebounceRef.current) clearTimeout(commentDebounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [photos]);

  const persistDraft = useCallback(
    async (payload: {
      photo_urls?: TaskProofPhotoRecord[];
      checklist?: Record<string, boolean>;
      comment?: string;
    }) => {
      setSaveStatus("saving");
      const result = await saveTaskDraft(shopId, task.id, staffId, payload);
      if (!result.ok) {
        setSaveStatus("error");
        return false;
      }
      if (result.autosave_available === false) {
        setAutosaveAvailable(false);
        setSaveStatus("idle");
        return true;
      }
      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), SAVED_INDICATOR_MS);
      return true;
    },
    [shopId, staffId, task.id],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingDraft(true);
    void (async () => {
      try {
        const draft = await loadTaskDraft(shopId, task.id, staffId);
        if (cancelled) return;
        if (draft) {
          setAutosaveAvailable(draft.autosave_available);
          setChecklist(draft.checklist);
          setComment(draft.comment);
          setPhotos(
            draft.photos.map((p) => ({
              photo: {
                original_path: p.original_path,
                display_path: p.display_path,
                captured_at: p.captured_at,
              },
              previewUrl: p.preview_url ?? "",
            })),
          );
        }
      } catch (e) {
        console.warn("[task-draft] load failed — continuing without autosave", {
          task_id: task.id,
          staff_id: staffId,
          error: e instanceof Error ? e.message : e,
        });
        setAutosaveAvailable(false);
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId, staffId, task.id, t]);

  const uploadPhoto = useCallback(
    async (file: File): Promise<{ photo: TaskProofPhotoRecord; previewUrl: string }> => {
      const form = new FormData();
      form.set("staff_id", staffId);
      form.set("task_id", task.id);
      form.set("file", file, "task-proof.jpg");
      const uploadUrl = `/api/shops/${encodeURIComponent(shopId)}/retail-tasks/photo-upload`;
      setUploadPercent(0);
      const result = await uploadTaskProofWithProgress(uploadUrl, form, (p) =>
        setUploadPercent(p.percent),
      );
      if (!result.ok) throw new Error(result.error);
      return {
        photo: result.result.photo,
        previewUrl: result.result.preview_url ?? "",
      };
    },
    [shopId, staffId, task.id],
  );

  const handleCaptured = useCallback(
    async (file: File, localPreviewUrl: string) => {
      setUploading(true);
      setUploadError(null);
      try {
        const uploaded = await uploadPhoto(file);
        if (localPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(localPreviewUrl);
        setPhotos((prev) => {
          const next = [
            ...prev,
            {
              photo: uploaded.photo,
              previewUrl: uploaded.previewUrl || localPreviewUrl,
            },
          ];
          void persistDraft({
            photo_urls: next.map((p) => p.photo),
            checklist: checklistRef.current,
            comment: commentRef.current,
          });
          return next;
        });
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), SAVED_INDICATOR_MS);
      } catch (e) {
        if (localPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(localPreviewUrl);
        setUploadError(e instanceof Error ? e.message : t("tasks.staff.uploadFailed"));
      } finally {
        setUploading(false);
        setUploadPercent(0);
      }
    },
    [persistDraft, t, uploadPhoto],
  );

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
      void persistDraft({
        photo_urls: next.map((p) => p.photo),
        checklist: checklistRef.current,
        comment: commentRef.current,
      });
      return next;
    });
  };

  const handleChecklistChange = (itemId: string, checked: boolean) => {
    setChecklist((prev) => {
      const next = { ...prev, [itemId]: checked };
      void persistDraft({
        checklist: next,
        photo_urls: photosRef.current.map((p) => p.photo),
        comment: commentRef.current,
      });
      return next;
    });
  };

  const handleCommentChange = (value: string) => {
    setComment(value);
    if (commentDebounceRef.current) clearTimeout(commentDebounceRef.current);
    commentDebounceRef.current = setTimeout(() => {
      void persistDraft({
        comment: value,
        checklist: checklistRef.current,
        photo_urls: photosRef.current.map((p) => p.photo),
      });
    }, COMMENT_DEBOUNCE_MS);
  };

  const checklistComplete = isChecklistComplete(checklistItems, checklist);
  const photosComplete = !needsPhotos || photos.length >= minPhotos;
  const canSubmit =
    checklistComplete && photosComplete && !uploading && !busy && !loadingDraft;

  const gpsErrorMessage = useCallback(
    (code: string) => {
      if (code === "GPS_PERMISSION_DENIED") return t("tasks.staff.gpsPermissionDenied");
      if (code === "GPS_UNAVAILABLE") return t("tasks.staff.gpsFetchFailed");
      return t("tasks.staff.gpsFetchFailed");
    },
    [t],
  );

  async function handleGetLocation() {
    setGpsLoading(true);
    setSubmitError(null);
    try {
      const coords = await acquireTaskSubmitGps(task.id, "get_location_button");
      setGpsCoords(coords);
      setSubmitError(null);
    } catch (e) {
      const code = e instanceof Error ? e.message : "GPS_UNAVAILABLE";
      setSubmitError(gpsErrorMessage(code));
      setGpsCoords(null);
    } finally {
      setGpsLoading(false);
    }
  }

  async function resolveSubmitGps(): Promise<TaskGpsCoordinates | null> {
    if (!gpsRequired) return null;
    if (gpsCoords) return gpsCoords;
    try {
      const coords = await acquireTaskSubmitGps(task.id, "submit");
      setGpsCoords(coords);
      return coords;
    } catch (e) {
      const code = e instanceof Error ? e.message : "GPS_UNAVAILABLE";
      setSubmitError(gpsErrorMessage(code));
      setGpsPromptVisible(true);
      return null;
    }
  }

  async function handleSubmitClick() {
    setSubmitError(null);
    if (commentDebounceRef.current) {
      clearTimeout(commentDebounceRef.current);
      await persistDraft({
        comment: commentRef.current,
        checklist: checklistRef.current,
        photo_urls: photosRef.current.map((p) => p.photo),
      });
    }
    if (!checklistComplete) {
      setSubmitError(t("tasks.staff.checklistIncomplete"));
      return;
    }
    if (!photosComplete) {
      setSubmitError(t("tasks.staff.notEnoughPhotos").replace("{count}", String(minPhotos)));
      return;
    }
    if (isOverdueSubmit && !overdueReason.trim()) {
      setOverdueReasonError(t("tasks.staff.overdueReasonRequired"));
      return;
    }
    setOverdueReasonError(null);

    const coords = await resolveSubmitGps();
    if (gpsRequired && !coords) {
      setGpsPromptVisible(true);
      return;
    }

    const checklistPayload =
      checklistItems.length > 0
        ? Object.fromEntries(checklistItems.map((item) => [item.id, checklist[item.id] === true]))
        : undefined;

    const result = await onSubmit({
      photo_urls: photos.map((p) => p.photo),
      checklist: checklistPayload,
      comment: comment.trim() || undefined,
      overdue_reason: isOverdueSubmit ? overdueReason.trim() : undefined,
      staff_latitude: coords?.latitude,
      staff_longitude: coords?.longitude,
      gps_accuracy_meters: coords?.accuracyMeters ?? undefined,
    });

    if (!result.ok) {
      const isOverdueFailure = result.code === "overdue_reason_required";
      if (isOverdueFailure) {
        setOverdueReasonError(t("tasks.staff.overdueReasonRequired"));
      }
      const isGpsFailure =
        result.code === "gps_required" || isGpsLocationMissingError(result.message);
      const message = isGpsFailure ? t("tasks.staff.gpsSubmitRequired") : result.message;
      setSubmitError(message);
      if (isGpsFailure) {
        setGpsCoords(null);
        setGpsPromptVisible(true);
      }
    }
  }

  const isGpsSubmitFailure =
    Boolean(submitError) &&
    (submitError === t("tasks.staff.gpsSubmitRequired") ||
      submitError === t("tasks.staff.gpsPermissionDenied") ||
      submitError === t("tasks.staff.gpsFetchFailed"));

  const saveStatusLabel =
    autosaveAvailable && saveStatus === "saving"
      ? t("tasks.staff.autoSaveSaving")
      : autosaveAvailable && saveStatus === "saved"
        ? t("tasks.staff.autoSaveSaved")
        : autosaveAvailable && saveStatus === "error"
          ? t("tasks.staff.autoSaveFailed")
          : null;

  if (loadingDraft) {
    return <p className="text-sm text-zinc-500">{t("tasks.loading")}</p>;
  }

  return (
    <div className="space-y-3">
      {saveStatusLabel ? (
        <p
          className={`text-[11px] font-medium ${
            saveStatus === "error" ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {saveStatusLabel}
        </p>
      ) : null}

      {checklistItems.length > 0 ? (
        <fieldset className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <legend className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {t("tasks.staff.checklistTitle")}
          </legend>
          <p className="text-[10px] text-zinc-500">{t("tasks.staff.checklistRequired")}</p>
          {checklistItems.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checklist[item.id] === true}
                onChange={(e) => handleChecklistChange(item.id, e.target.checked)}
              />
              <span>
                {item.label}
                {!item.required ? (
                  <span className="ml-1 text-[10px] text-zinc-400">
                    ({t("tasks.staff.checklistOptional")})
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {needsPhotos ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {t("tasks.staff.photosProgress")
              .replace("{count}", String(photos.length))
              .replace("{required}", String(minPhotos))}
          </p>
          <TaskProofCamera
            allowGallery={allowGallery}
            disabled={uploading || busy}
            onCaptured={({ file, previewUrl }) => void handleCaptured(file, previewUrl)}
          />
          {uploading ? (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full bg-emerald-600 transition-all"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                {t("tasks.staff.uploadProgress").replace("{percent}", String(uploadPercent))}
              </p>
            </div>
          ) : null}
          {photos.length > 0 ? (
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <li key={p.photo.display_path} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt=""
                    className="aspect-square w-full rounded border border-zinc-200 object-cover dark:border-zinc-700"
                  />
                  <p className="mt-0.5 text-center text-[9px] text-zinc-500">
                    {formatTaskProofPhotoTimestamp(p.photo.captured_at)}
                  </p>
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {isOverdueSubmit ? (
        <div className="space-y-1 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900/50 dark:bg-orange-950/20">
          <p className="text-xs font-medium text-orange-900 dark:text-orange-100">
            {t("tasks.staff.pastDue")}
          </p>
          <label className="block text-sm font-medium text-orange-950 dark:text-orange-100">
            {t("tasks.staff.overdueReasonLabel")}
            <textarea
              className="mt-1 w-full rounded border border-orange-300 bg-white px-2 py-1 text-sm dark:border-orange-800 dark:bg-zinc-900"
              placeholder={t("tasks.staff.overdueReasonPlaceholder")}
              value={overdueReason}
              onChange={(e) => {
                setOverdueReason(e.target.value);
                if (overdueReasonError && e.target.value.trim()) {
                  setOverdueReasonError(null);
                }
              }}
            />
          </label>
          {overdueReasonError ? (
            <p className="text-xs text-red-600">{overdueReasonError}</p>
          ) : null}
        </div>
      ) : null}

      <textarea
        className="w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        placeholder={t("tasks.staff.comment")}
        value={comment}
        onChange={(e) => handleCommentChange(e.target.value)}
      />

      {uploadError ? <p className="text-xs text-red-600">{uploadError}</p> : null}

      {submitError && !isGpsSubmitFailure ? (
        <p className="text-xs text-red-600">{submitError}</p>
      ) : null}

      {gpsRequired && gpsPromptVisible ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          {gpsCoords ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {t("tasks.staff.gpsReady")}
            </p>
          ) : (
            <>
              <p className="text-xs text-amber-900 dark:text-amber-200">
                {submitError ?? t("tasks.staff.gpsSubmitRequired")}
              </p>
              <button
                type="button"
                disabled={gpsLoading || busy}
                onClick={() => void handleGetLocation()}
                className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-100"
              >
                {gpsLoading ? t("tasks.loading") : t("tasks.staff.getLocation")}
              </button>
            </>
          )}
        </div>
      ) : null}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => void handleSubmitClick()}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {uploading ? t("tasks.staff.uploading") : t("tasks.staff.submit")}
      </button>
    </div>
  );
}
