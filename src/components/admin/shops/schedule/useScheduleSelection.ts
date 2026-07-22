"use client";

import { useCallback, useRef, useState } from "react";
import type { CellCoord } from "./schedule-utils";

export type SelectionRect = {
  start: CellCoord;
  end: CellCoord;
};

export function useScheduleSelection(staffIds: string[], weekDays: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<CellCoord | null>(null);
  const [anchor, setAnchor] = useState<CellCoord | null>(null);
  const dragRef = useRef<{
    active: boolean;
    source: CellCoord & { value: string };
    rect: SelectionRect;
  } | null>(null);
  const [dragRect, setDragRect] = useState<SelectionRect | null>(null);

  const coordToKey = useCallback((c: CellCoord) => `${c.staffId}:${c.date}`, []);

  const getRectCells = useCallback(
    (rect: SelectionRect): CellCoord[] => {
      const sIdx = staffIds.indexOf(rect.start.staffId);
      const eIdx = staffIds.indexOf(rect.end.staffId);
      const dStart = weekDays.indexOf(rect.start.date);
      const dEnd = weekDays.indexOf(rect.end.date);
      if (sIdx < 0 || eIdx < 0 || dStart < 0 || dEnd < 0) return [];

      const minS = Math.min(sIdx, eIdx);
      const maxS = Math.max(sIdx, eIdx);
      const minD = Math.min(dStart, dEnd);
      const maxD = Math.max(dStart, dEnd);

      const cells: CellCoord[] = [];
      for (let si = minS; si <= maxS; si++) {
        for (let di = minD; di <= maxD; di++) {
          cells.push({ staffId: staffIds[si]!, date: weekDays[di]! });
        }
      }
      return cells;
    },
    [staffIds, weekDays],
  );

  const selectCell = useCallback(
    (coord: CellCoord, opts?: { shift?: boolean; extend?: boolean }) => {
      if (opts?.shift && anchor) {
        const rect = { start: anchor, end: coord };
        const cells = getRectCells(rect);
        setSelected(new Set(cells.map(coordToKey)));
        setFocused(coord);
        return;
      }
      if (opts?.extend && focused) {
        const rect = { start: focused, end: coord };
        const cells = getRectCells(rect);
        setSelected(new Set(cells.map(coordToKey)));
        return;
      }
      setAnchor(coord);
      setFocused(coord);
      setSelected(new Set([coordToKey(coord)]));
    },
    [anchor, focused, coordToKey, getRectCells],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
    setDragRect(null);
    dragRef.current = null;
  }, []);

  const startDragFill = useCallback(
    (source: CellCoord & { value: string }) => {
      dragRef.current = { active: true, source, rect: { start: source, end: source } };
      setDragRect({ start: source, end: source });
      setSelected(new Set([coordToKey(source)]));
    },
    [coordToKey],
  );

  const extendDragFill = useCallback(
    (coord: CellCoord) => {
      if (!dragRef.current?.active) return;
      const rect = { start: dragRef.current.source, end: coord };
      dragRef.current.rect = rect;
      setDragRect(rect);
      const cells = getRectCells(rect);
      setSelected(new Set(cells.map(coordToKey)));
    },
    [coordToKey, getRectCells],
  );

  const endDragFill = useCallback((): {
    source: CellCoord & { value: string };
    targets: CellCoord[];
  } | null => {
    if (!dragRef.current?.active) return null;
    const { source, rect } = dragRef.current;
    dragRef.current = null;
    setDragRect(null);
    const cells = getRectCells(rect);
    const targets = cells.filter(
      (c) => !(c.staffId === source.staffId && c.date === source.date),
    );
    return { source, targets };
  }, [getRectCells]);

  const moveFocus = useCallback(
    (dir: "up" | "down" | "left" | "right", shiftKey = false) => {
      if (!focused) {
        if (staffIds[0] && weekDays[0]) {
          const c = { staffId: staffIds[0], date: weekDays[0] };
          selectCell(c);
        }
        return;
      }
      const sIdx = staffIds.indexOf(focused.staffId);
      const dIdx = weekDays.indexOf(focused.date);
      let newS = sIdx;
      let newD = dIdx;
      if (dir === "up") newS = Math.max(0, sIdx - 1);
      if (dir === "down") newS = Math.min(staffIds.length - 1, sIdx + 1);
      if (dir === "left") newD = Math.max(0, dIdx - 1);
      if (dir === "right") newD = Math.min(weekDays.length - 1, dIdx + 1);
      const next = { staffId: staffIds[newS]!, date: weekDays[newD]! };
      if (shiftKey) {
        selectCell(next, { shift: true });
      } else {
        selectCell(next);
      }
    },
    [focused, staffIds, weekDays, selectCell],
  );

  const isSelected = useCallback(
    (coord: CellCoord) => selected.has(coordToKey(coord)),
    [selected, coordToKey],
  );

  return {
    selected,
    focused,
    dragRect,
    selectCell,
    clearSelection,
    startDragFill,
    extendDragFill,
    endDragFill,
    moveFocus,
    isSelected,
    setFocused,
    getRectCells,
    coordToKey,
  };
}
