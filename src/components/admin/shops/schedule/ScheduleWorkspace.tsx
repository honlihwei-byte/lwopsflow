"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LanguageProvider";
import { Toast } from "@/components/Toast";
import { useAdminToast } from "@/components/admin/useAdminToast";
import { formatTemplate } from "@/lib/i18n/format-template";
import {
  buildCellView,
  wouldOverlapOtherShop,
  type OtherShopAssignment,
} from "@/lib/shifts/schedule-cell-status";
import { isScheduleStatusCode } from "@/lib/shifts/schedule-off-day";
import type { ShopShiftTemplate } from "../ShopShiftTemplatesPanel";
import type { ScheduleRow } from "../EditShiftsModal";
import { EditShiftsModal } from "../EditShiftsModal";
import { OFF_VALUE, crossShopConfirmMessage } from "../ScheduleCellPicker";
import type { CrossShopScheduleRow } from "../ShopStaffSchedulePanel";
import { ScheduleCell } from "./ScheduleCell";
import { ScheduleCellPopup } from "./ScheduleCellPopup";
import { ScheduleContextMenu, type ContextMenuAction } from "./ScheduleContextMenu";
import { ScheduleDaySummaries, ScheduleEmployeeSummary } from "./ScheduleSummaries";
import { ScheduleToolbar, type BulkTool } from "./ScheduleToolbar";
import {
  addDays,
  cellAssignmentValue,
  cellHasTimedShifts,
  cellKey,
  dayLabel,
  findTemplateByName,
  isWeekend,
  mondayOfWeek,
  parseCellKey,
  readErr,
  todayYmd,
  type ScheduleStaff,
  valueToSyntheticShifts,
} from "./schedule-utils";
import { useScheduleClipboard } from "./useScheduleClipboard";
import { useScheduleHistory } from "./useScheduleHistory";
import { useScheduleSelection } from "./useScheduleSelection";

const ROW_HEIGHT = 42;
const VIRTUAL_BUFFER = 8;

type CellSaveSlot = {
  inFlight: boolean;
  revertValue: string;
};

export function ScheduleWorkspace({
  shopId,
  shopName,
  shops,
  onShopChange,
}: {
  shopId: string;
  shopName: string;
  shops?: { id: string; name: string }[];
  onShopChange?: (id: string) => void;
}) {
  const { t } = useI18n();
  const { toast, showError, dismiss } = useAdminToast();
  const today = todayYmd();
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(today));
  const [staff, setStaff] = useState<ScheduleStaff[]>([]);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [crossShopRows, setCrossShopRows] = useState<CrossShopScheduleRow[]>([]);
  const [currentShopName, setCurrentShopName] = useState("");
  const [templates, setTemplates] = useState<ShopShiftTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [showFullTimeOnly, setShowFullTimeOnly] = useState(false);
  const [savingCells, setSavingCells] = useState<Set<string>>(() => new Set());
  const [optimisticAssignments, setOptimisticAssignments] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pickerCell, setPickerCell] = useState<{ staffId: string; date: string; rect: DOMRect } | null>(null);
  const [editModal, setEditModal] = useState<{ staffId: string; staffName: string; date: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; staffId: string; date: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragMovedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellSaveSlotsRef = useRef<Map<string, CellSaveSlot>>(new Map());
  const optimisticAssignmentsRef = useRef(optimisticAssignments);
  const cellMapRef = useRef(new Map<string, ScheduleRow[]>());
  const templatesRef = useRef<ShopShiftTemplate[]>([]);

  useEffect(() => {
    optimisticAssignmentsRef.current = optimisticAssignments;
  }, [optimisticAssignments]);

  const history = useScheduleHistory();
  const clipboard = useScheduleClipboard();

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDays[6]!;

  const cellViewLabels = useMemo(
    () => ({
      notScheduledHere: t("shops.editForm.staffSchedule.notScheduledHere"),
      offDayLabel: t("shops.editForm.staffSchedule.offDayLabel"),
      workingAtOther: t("shops.editForm.staffSchedule.workingAtOther"),
      otherShopTimes: t("shops.editForm.staffSchedule.otherShopTimes"),
      assignedAtTooltip: t("shops.editForm.staffSchedule.assignedAtTooltip"),
      currentShopLine: t("shops.editForm.staffSchedule.thisShop"),
    }),
    [t],
  );

  const cellMap = useMemo(() => {
    const grouped = new Map<string, ScheduleRow[]>();
    for (const r of rows) {
      if (r.status !== "active") continue;
      const key = cellKey(r.staff_id, r.shift_date);
      const list = grouped.get(key) ?? [];
      list.push(r);
      grouped.set(key, list);
    }
    return grouped;
  }, [rows]);

  useEffect(() => {
    cellMapRef.current = cellMap;
  }, [cellMap]);

  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);

  const displayCellMap = useMemo(() => {
    const m = new Map(cellMap);
    for (const [key, value] of Object.entries(optimisticAssignments)) {
      const { staffId, date } = parseCellKey(key);
      m.set(key, valueToSyntheticShifts(staffId, date, value, templates));
    }
    return m;
  }, [cellMap, optimisticAssignments, templates]);

  const getEffectiveAssignment = useCallback(
    (key: string) => {
      if (key in optimisticAssignments) return optimisticAssignments[key]!;
      const shifts = cellMap.get(key) ?? [];
      return cellAssignmentValue(shifts, templates);
    },
    [optimisticAssignments, cellMap, templates],
  );

  const filteredStaff = useMemo(() => {
    let list = staff;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) => s.staff_name.toLowerCase().includes(q) || s.staff_code.toLowerCase().includes(q),
      );
    }
    if (showFullTimeOnly) {
      list = list.filter((s) => s.staff_type === "full_time");
    }
    return list;
  }, [staff, search, showFullTimeOnly, showActiveOnly]);

  const staffIds = useMemo(() => filteredStaff.map((s) => s.id), [filteredStaff]);
  const selection = useScheduleSelection(staffIds, weekDays);

  const buildClipboardData = useCallback(
    (
      anchor: { staffId: string; date: string },
      cells: Array<{ staffId: string; date: string; value: string }>,
    ) => {
      const anchorStaffIdx = staffIds.indexOf(anchor.staffId);
      const anchorDateIdx = weekDays.indexOf(anchor.date);
      return {
        cells: cells.map((c) => ({
          rowOff: staffIds.indexOf(c.staffId) - anchorStaffIdx,
          colOff: weekDays.indexOf(c.date) - anchorDateIdx,
          value: c.value,
        })),
      };
    },
    [staffIds, weekDays],
  );

  const pasteAt = useCallback(
    (staffId: string, date: string) => {
      const sIdx = staffIds.indexOf(staffId);
      const dIdx = weekDays.indexOf(date);
      if (sIdx < 0 || dIdx < 0) return null;
      return clipboard.paste(sIdx, dIdx, staffIds, weekDays);
    },
    [clipboard, staffIds, weekDays],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ from: weekStart, to: weekEnd });
        const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule?${qs}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(await readErr(res));
        const j = (await res.json()) as {
          staff?: ScheduleStaff[];
          rows?: ScheduleRow[];
          crossShopRows?: CrossShopScheduleRow[];
          templates?: ShopShiftTemplate[];
          shop?: { name?: string };
        };
        setStaff(j.staff ?? []);
        setRows(j.rows ?? []);
        setCrossShopRows(j.crossShopRows ?? []);
        setCurrentShopName(j.shop?.name ?? shopName);
        setTemplates(j.templates ?? []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed");
        setError(msg);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [shopId, weekStart, weekEnd, shopName, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<{ shopId?: string }>;
      if (!e.detail?.shopId || e.detail.shopId !== shopId) return;
      void load({ silent: true });
    };
    window.addEventListener("opsflow:templatesUpdated", handler as EventListener);
    return () => window.removeEventListener("opsflow:templatesUpdated", handler as EventListener);
  }, [shopId, load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, [loading, filteredStaff.length]);

  function otherAssignmentsFor(staffId: string, date: string): OtherShopAssignment[] {
    return buildCellView(
      [],
      crossShopRows,
      staffId,
      date,
      templates,
      currentShopName,
      cellViewLabels,
      (shop) => formatTemplate(cellViewLabels.workingAtOther, { shop }),
      (start, end) => formatTemplate(cellViewLabels.otherShopTimes, { start, end }),
    ).otherTimed;
  }

  async function confirmCrossShopIfNeeded(
    staffId: string,
    date: string,
    template: ShopShiftTemplate | null,
    isOff: boolean,
  ): Promise<boolean> {
    if (isOff || !template) return true;
    const conflict = wouldOverlapOtherShop(
      otherAssignmentsFor(staffId, date),
      template.start_time,
      template.end_time,
    );
    if (!conflict) return true;
    return window.confirm(crossShopConfirmMessage(t, conflict));
  }

  async function postSchedule(
    staffId: string,
    date: string,
    body: Record<string, unknown>,
  ): Promise<ScheduleRow> {
    const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: staffId, shift_date: date, ...body }),
    });
    if (!res.ok) throw new Error(await readErr(res));
    const j = (await res.json()) as { row?: ScheduleRow };
    if (!j.row) throw new Error("No row returned");
    return j.row;
  }

  const patchRowFromServer = useCallback((row: ScheduleRow) => {
    setRows((prev) => {
      const rest = prev.filter(
        (r) =>
          !(
            r.staff_id === row.staff_id &&
            r.shift_date === row.shift_date &&
            r.status === "active"
          ),
      );
      return [...rest, row];
    });
  }, []);

  const setCellSaving = useCallback((key: string, saving: boolean) => {
    setSavingCells((prev) => {
      const next = new Set(prev);
      if (saving) next.add(key);
      else next.delete(key);
      setSaveStatus(next.size > 0 ? "saving" : "idle");
      return next;
    });
  }, []);

  const markSaved = useCallback(() => {
    setSaveStatus("saved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
    }, 2000);
  }, []);

  const runCellSave = useCallback(
    async (staffId: string, date: string, value: string, revertValue: string) => {
      const key = cellKey(staffId, date);
      const slots = cellSaveSlotsRef.current;
      let slot = slots.get(key);
      if (!slot) {
        slot = { inFlight: false, revertValue };
        slots.set(key, slot);
      }

      if (slot.inFlight) return;

      slot.inFlight = true;
      setCellSaving(key, true);

      let succeeded = false;
      try {
        let row: ScheduleRow;
        if (value === OFF_VALUE || value === "RD") {
          row = await postSchedule(staffId, date, { is_off_day: true, leave_code: "RD" });
        } else if (value === "NS") {
          row = await postSchedule(staffId, date, { is_off_day: true, leave_code: "NS" });
        } else if (isScheduleStatusCode(value)) {
          row = await postSchedule(staffId, date, { is_off_day: true, leave_code: value });
        } else {
          const existing = cellMapRef.current.get(key) ?? [];
          row = await postSchedule(staffId, date, {
            template_id: value,
            is_off_day: false,
            add: cellHasTimedShifts(existing),
          });
        }

        patchRowFromServer(row);
        setOptimisticAssignments((prev) => {
          if (prev[key] !== value) return prev;
          const { [key]: _removed, ...rest } = prev;
          return rest;
        });
        succeeded = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed");
        setOptimisticAssignments((prev) => {
          if (prev[key] !== value) return prev;
          if (!revertValue) {
            const { [key]: _removed, ...rest } = prev;
            return rest;
          }
          return { ...prev, [key]: revertValue };
        });
        showError(msg);
      } finally {
        slot.inFlight = false;
        setSavingCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          if (succeeded && next.size === 0) {
            markSaved();
          } else if (next.size > 0) {
            setSaveStatus("saving");
          } else if (!succeeded) {
            setSaveStatus("idle");
          }
          return next;
        });

        const pendingValue = optimisticAssignmentsRef.current[key];
        const rowsValue = cellAssignmentValue(
          cellMapRef.current.get(key) ?? [],
          templatesRef.current,
        );
        if (pendingValue !== undefined && pendingValue !== rowsValue) {
          void runCellSave(staffId, date, pendingValue, rowsValue);
        } else {
          cellSaveSlotsRef.current.delete(key);
        }
      }
    },
    [markSaved, patchRowFromServer, setCellSaving, showError, t],
  );

  const assignValue = useCallback(
    async (
      staffId: string,
      date: string,
      value: string,
      opts?: { trackHistory?: boolean },
    ) => {
      const key = cellKey(staffId, date);
      const current = getEffectiveAssignment(key);
      if (value === current) return;

      const slot = cellSaveSlotsRef.current.get(key);
      if (slot?.inFlight) {
        setOptimisticAssignments((prev) => ({ ...prev, [key]: value }));
        return;
      }

      if (value && !isScheduleStatusCode(value) && value !== OFF_VALUE && value !== "RD" && value !== "NS") {
        const tpl = templates.find((item) => item.id === value);
        if (!(await confirmCrossShopIfNeeded(staffId, date, tpl ?? null, false))) return;
      }

      const revertValue = current;

      if (opts?.trackHistory !== false) {
        history.pushAction({
          cells: [{ staffId, date, previousValue: current }],
          newValue: value,
        });
      }

      setOptimisticAssignments((prev) => ({ ...prev, [key]: value }));
      void runCellSave(staffId, date, value, revertValue);
    },
    [getEffectiveAssignment, history, runCellSave, templates, t],
  );

  const assignToMany = useCallback(
    (cells: Array<{ staffId: string; date: string; value: string }>) => {
      history.startBatch();
      for (const cell of cells) {
        void assignValue(cell.staffId, cell.date, cell.value, { trackHistory: true });
      }
      history.commitBatch();
    },
    [assignValue, history],
  );

  useEffect(() => {
    function onMouseUp() {
      if (!isDragging) return;
      setIsDragging(false);
      if (dragMovedRef.current) {
        const result = selection.endDragFill();
        if (result && result.targets.length > 0) {
          void assignToMany(
            result.targets.map((t) => ({
              staffId: t.staffId,
              date: t.date,
              value: result.source.value,
            })),
          );
        }
      }
      dragMovedRef.current = false;
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [isDragging, selection, assignToMany]);

  const handleSelect = useCallback(
    (value: string) => {
      if (!pickerCell) return;
      const { staffId, date } = pickerCell;
      setPickerCell(null);
      void assignValue(staffId, date, value);
    },
    [pickerCell, assignValue],
  );

  const handleBulkTool = useCallback(
    async (tool: BulkTool) => {
      const selectedCells = [...selection.selected].map((k) => {
        const [staffId, date] = k.split(":");
        return { staffId: staffId!, date: date! };
      });

      if (tool === "copy_week") {
        setError(null);
        try {
          const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule/copy-week`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ week_start: weekStart }),
          });
          if (!res.ok) throw new Error(await readErr(res));
          await load({ silent: true });
          markSaved();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed"));
        }
        return;
      }

      if (tool === "clear") {
        const cells = staffIds.flatMap((sid) =>
          weekDays.map((d) => ({ staffId: sid, date: d, value: "NS" })),
        );
        await assignToMany(cells);
        return;
      }

      if (tool === "off" || tool === "leave") {
        const targets =
          selectedCells.length > 0
            ? selectedCells
            : staffIds.map((sid) => ({ staffId: sid, date: weekDays[4]! }));
        await assignToMany(
          targets.map((c) => ({ ...c, value: tool === "off" ? "RD" : "AL" })),
        );
        return;
      }

      if (tool === "assign") {
        const tpl = templates[0];
        if (!tpl) return;
        const targets =
          selectedCells.length > 0
            ? selectedCells
            : staffIds.map((sid) => ({ staffId: sid, date: weekDays[0]! }));
        await assignToMany(targets.map((c) => ({ ...c, value: tpl.id })));
        return;
      }

      if (tool === "auto") {
        const morning = findTemplateByName(templates, "morning");
        if (!morning) return;
        const cells: Array<{ staffId: string; date: string; value: string }> = [];
        for (const sid of staffIds) {
          for (const d of weekDays) {
            if (!isWeekend(d)) cells.push({ staffId: sid, date: d, value: morning.id });
          }
        }
        await assignToMany(cells);
        return;
      }

      if (tool === "rotate") {
        const shiftTemplates = templates.slice(0, 3);
        if (shiftTemplates.length === 0) return;
        const cells: Array<{ staffId: string; date: string; value: string }> = [];
        const targetDay = weekDays[4] ?? weekDays[0]!;
        staffIds.forEach((sid, idx) => {
          cells.push({
            staffId: sid,
            date: targetDay,
            value: shiftTemplates[idx % shiftTemplates.length]!.id,
          });
        });
        await assignToMany(cells);
      }
    },
    [selection.selected, staffIds, weekDays, shopId, weekStart, load, markSaved, t, assignToMany, templates],
  );

  const handleContextAction = useCallback(
    async (action: ContextMenuAction) => {
      if (!contextMenu) return;
      const { staffId, date } = contextMenu;

      if (action === "copy") {
        const anchor = { staffId, date };
        const selected = [...selection.selected].map((k) => {
          const [sid, d] = k.split(":");
          return {
            staffId: sid!,
            date: d!,
            value: getEffectiveAssignment(k),
          };
        });
        const cells =
          selected.length > 0
            ? selected
            : [
                {
                  staffId,
                  date,
                  value: getEffectiveAssignment(cellKey(staffId, date)),
                },
              ];
        clipboard.copy(buildClipboardData(anchor, cells));
        return;
      }

      if (action === "paste") {
        const pasted = pasteAt(staffId, date);
        if (!pasted) return;
        await assignToMany(pasted.filter((p) => p.value));
        return;
      }

      if (action === "clear") {
        await assignValue(staffId, date, "NS");
        return;
      }

      if (action === "duplicate_day") {
        setError(null);
        try {
          const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/staff-schedule/copy-day`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_date: date }),
          });
          if (!res.ok) throw new Error(await readErr(res));
          await load({ silent: true });
          markSaved();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("shops.editForm.staffSchedule.copyDayFailed"));
        }
        return;
      }

      if (action === "duplicate_week") {
        await handleBulkTool("copy_week");
        return;
      }

      if (action === "mark_leave") {
        await assignValue(staffId, date, "AL");
        return;
      }

      if (action === "mark_holiday") {
        await assignValue(staffId, date, "RD");
      }
    },
    [
      contextMenu,
      selection.selected,
      cellMap,
      templates,
      clipboard,
      assignToMany,
      assignValue,
      shopId,
      load,
      markSaved,
      t,
      handleBulkTool,
      buildClipboardData,
      pasteAt,
      getEffectiveAssignment,
    ],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      if (e.key === "Escape") {
        setPickerCell(null);
        selection.clearSelection();
        setContextMenu(null);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        if (selection.focused) {
          const { staffId, date } = selection.focused;
          const selected = [...selection.selected].map((k) => {
            const [sid, d] = k.split(":");
            return {
              staffId: sid!,
              date: d!,
              value: getEffectiveAssignment(k),
            };
          });
          const cells =
            selected.length > 0
              ? selected
              : [
                  {
                    staffId,
                    date,
                    value: getEffectiveAssignment(cellKey(staffId, date)),
                  },
                ];
          clipboard.copy(buildClipboardData({ staffId, date }, cells));
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        e.preventDefault();
        if (selection.focused) {
          const pasted = pasteAt(selection.focused.staffId, selection.focused.date);
          if (pasted) void assignToMany(pasted.filter((p) => p.value));
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const action = history.undo();
        if (action) {
          void (async () => {
            for (const cell of action.cells) {
              await assignValue(cell.staffId, cell.date, cell.previousValue, { trackHistory: false });
            }
          })();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        const action = history.redo();
        if (action) {
          void (async () => {
            for (const cell of action.cells) {
              await assignValue(cell.staffId, cell.date, action.newValue, { trackHistory: false });
            }
          })();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        for (const k of selection.selected) {
          const [sid, d] = k.split(":");
          void assignValue(sid!, d!, "NS");
        }
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        selection.moveFocus("up", e.shiftKey);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selection.moveFocus("down", e.shiftKey);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        selection.moveFocus("left", e.shiftKey);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        selection.moveFocus("right", e.shiftKey);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        selection.moveFocus(e.shiftKey ? "left" : "right");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, templates, clipboard, assignToMany, assignValue, history, buildClipboardData, pasteAt, getEffectiveAssignment]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIRTUAL_BUFFER);
  const endIndex = Math.min(
    filteredStaff.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + VIRTUAL_BUFFER,
  );
  const visibleStaff = filteredStaff.slice(startIndex, endIndex);
  const topSpacer = startIndex * ROW_HEIGHT;
  const bottomSpacer = Math.max(0, (filteredStaff.length - endIndex) * ROW_HEIGHT);

  const modalShifts = editModal
    ? (displayCellMap.get(cellKey(editModal.staffId, editModal.date)) ?? [])
    : [];
  const modalOther = editModal ? otherAssignmentsFor(editModal.staffId, editModal.date) : [];

  return (
    <div className="space-y-2">
      <ScheduleToolbar
        weekStart={weekStart}
        weekEnd={weekEnd}
        shopName={currentShopName || shopName}
        shops={shops}
        onShopChange={onShopChange}
        search={search}
        onSearchChange={setSearch}
        showActiveOnly={showActiveOnly}
        onShowActiveOnlyChange={setShowActiveOnly}
        showFullTimeOnly={showFullTimeOnly}
        onShowFullTimeOnlyChange={setShowFullTimeOnly}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => {
          const action = history.undo();
          if (action) {
            void (async () => {
              for (const cell of action.cells) {
                await assignValue(cell.staffId, cell.date, cell.previousValue, { trackHistory: false });
              }
            })();
          }
        }}
        onRedo={() => {
          const action = history.redo();
          if (action) {
            void (async () => {
              for (const cell of action.cells) {
                await assignValue(cell.staffId, cell.date, action.newValue, { trackHistory: false });
              }
            })();
          }
        }}
        saveStatus={saveStatus}
        onPrevWeek={() => setWeekStart(addDays(weekStart, -7))}
        onToday={() => setWeekStart(mondayOfWeek(today))}
        onNextWeek={() => setWeekStart(addDays(weekStart, 7))}
        onJumpDate={(d) => setWeekStart(mondayOfWeek(d))}
        onBulkTool={(tool) => void handleBulkTool(tool)}
      />

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-xs text-zinc-500">{t("shops.editForm.staffSchedule.loading")}</p>
      ) : filteredStaff.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("shops.editForm.staffSchedule.noStaff")}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200/60 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <ScheduleDaySummaries
            weekDays={weekDays}
            staffIds={staffIds}
            cellMap={displayCellMap}
            templates={templates}
            today={today}
          />

          <div
            ref={scrollRef}
            className="max-h-[calc(100vh-320px)] min-h-[300px] overflow-auto"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            onWheel={(e) => {
              const el = e.currentTarget;
              if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                el.scrollLeft += e.deltaY;
                e.preventDefault();
              }
            }}
          >
            <div className="min-w-max">
              <div className="sticky top-0 z-30 flex border-b border-zinc-100 bg-zinc-50/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
                <div className="sticky left-0 z-40 w-[160px] shrink-0 border-r border-zinc-100 bg-zinc-50/95 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
                  {t("shops.editForm.staffSchedule.staff")}
                </div>
                {weekDays.map((d) => (
                  <div
                    key={d}
                    className={`min-w-[72px] flex-1 border-l border-zinc-100 px-1 py-2 text-center dark:border-zinc-800 ${
                      d === today ? "bg-amber-50/60 ring-1 ring-inset ring-amber-300/50 dark:bg-amber-950/20" : isWeekend(d) ? "bg-zinc-100/50 dark:bg-zinc-900/40" : ""
                    }`}
                  >
                    <div className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-200">
                      {dayLabel(d)}
                    </div>
                  </div>
                ))}
                <div className="w-[100px] shrink-0 px-1 py-2 text-center text-[9px] font-semibold uppercase text-zinc-400">
                  {t("shops.editForm.scheduler.summary")}
                </div>
              </div>

              <div style={{ height: topSpacer }} />
              {visibleStaff.map((s) => (
                <div
                  key={s.id}
                  className="flex border-b border-zinc-50 dark:border-zinc-900"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="sticky left-0 z-20 flex w-[160px] shrink-0 items-center border-r border-zinc-100 bg-white/95 px-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-zinc-800 dark:text-zinc-100">
                        {s.staff_name}
                      </div>
                      <div className="truncate text-[9px] text-zinc-400">{s.staff_code}</div>
                    </div>
                  </div>
                  {weekDays.map((d) => {
                    const key = cellKey(s.id, d);
                    const cellShifts = displayCellMap.get(key) ?? [];
                    const coord = { staffId: s.id, date: d };
                    const isSaving = savingCells.has(key);

                    return (
                      <div
                        key={d}
                        className={`min-w-[72px] flex-1 border-l border-zinc-50 p-0.5 dark:border-zinc-900 ${
                          isWeekend(d) ? "bg-zinc-50/30 dark:bg-zinc-900/20" : ""
                        }`}
                      >
                        <ScheduleCell
                          staffId={s.id}
                          date={d}
                          shifts={cellShifts}
                          crossShopRows={crossShopRows}
                          templates={templates}
                          currentShopName={currentShopName}
                          cellViewLabels={cellViewLabels}
                          formatWorkingAtOther={(shop) =>
                            formatTemplate(cellViewLabels.workingAtOther, { shop })
                          }
                          formatOtherTimes={(start, end) =>
                            formatTemplate(cellViewLabels.otherShopTimes, { start, end })
                          }
                          isToday={d === today}
                          isWeekend={isWeekend(d)}
                          isSelected={selection.isSelected(coord)}
                          isFocused={
                            selection.focused?.staffId === s.id && selection.focused?.date === d
                          }
                          isSaving={isSaving}
                          isDragTarget={isDragging && selection.isSelected(coord)}
                          onClick={(e, el) => {
                            if (dragMovedRef.current) return;
                            if (e.shiftKey) {
                              selection.selectCell(coord, { shift: true });
                              return;
                            }
                            selection.selectCell(coord);
                            const rect = el.getBoundingClientRect();
                            setPickerCell({ staffId: s.id, date: d, rect });
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            selection.selectCell(coord);
                            setContextMenu({ x: e.clientX, y: e.clientY, staffId: s.id, date: d });
                          }}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            const value = getEffectiveAssignment(key);
                            setIsDragging(true);
                            selection.startDragFill({ staffId: s.id, date: d, value });
                          }}
                          onMouseEnter={() => {
                            if (isDragging) {
                              dragMovedRef.current = true;
                              selection.extendDragFill(coord);
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                  <ScheduleEmployeeSummary
                    staffId={s.id}
                    weekDays={weekDays}
                    cellMap={displayCellMap}
                    templates={templates}
                  />
                </div>
              ))}
              <div style={{ height: bottomSpacer }} />
            </div>
          </div>
        </div>
      )}

      <ScheduleCellPopup
        open={pickerCell != null}
        currentValue={
          pickerCell
            ? getEffectiveAssignment(cellKey(pickerCell.staffId, pickerCell.date))
            : ""
        }
        otherAssignments={
          pickerCell ? otherAssignmentsFor(pickerCell.staffId, pickerCell.date) : []
        }
        templates={templates}
        busy={false}
        anchorRect={pickerCell?.rect ?? null}
        onSelect={(v) => void handleSelect(v)}
        onCustom={() => {
          if (!pickerCell) return;
          const s = staff.find((st) => st.id === pickerCell.staffId);
          setPickerCell(null);
          setEditModal({
            staffId: pickerCell.staffId,
            staffName: s?.staff_name ?? "",
            date: pickerCell.date,
          });
        }}
        onClose={() => setPickerCell(null)}
      />

      <ScheduleContextMenu
        open={contextMenu != null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        canPaste={clipboard.hasClipboard}
        onAction={(a) => void handleContextAction(a)}
        onClose={() => setContextMenu(null)}
      />

      <EditShiftsModal
        open={editModal != null}
        staffName={editModal?.staffName ?? ""}
        date={editModal?.date ?? ""}
        shifts={modalShifts}
        otherAssignments={modalOther}
        templates={templates}
        busy={
          editModal != null && savingCells.has(cellKey(editModal.staffId, editModal.date))
        }
        onClose={() => setEditModal(null)}
        onReplaceShift={(templateId) => {
          if (!editModal) return;
          setEditModal(null);
          void assignValue(editModal.staffId, editModal.date, templateId);
        }}
        onMarkOff={() => {
          if (!editModal) return;
          setEditModal(null);
          void assignValue(editModal.staffId, editModal.date, "RD");
        }}
        onDelete={async (id) => {
          try {
            const res = await fetch(
              `/api/shops/${encodeURIComponent(shopId)}/staff-schedule/${encodeURIComponent(id)}`,
              { method: "DELETE", credentials: "include" },
            );
            if (!res.ok) throw new Error(await readErr(res));
            await load({ silent: true });
            markSaved();
          } catch (e) {
            showError(e instanceof Error ? e.message : t("shops.editForm.staffSchedule.saveFailed"));
          }
        }}
      />

      <Toast message={toast?.message ?? null} variant={toast?.variant} onDismiss={dismiss} />
    </div>
  );
}
