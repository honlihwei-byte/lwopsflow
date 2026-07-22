"use client";

import { useCallback, useRef, useState } from "react";

export type ClipboardCell = {
  rowOff: number;
  colOff: number;
  value: string;
};

export type ClipboardData = {
  cells: ClipboardCell[];
};

export function useScheduleClipboard() {
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);
  const clipboardRef = useRef<ClipboardData | null>(null);

  const copy = useCallback((data: ClipboardData) => {
    clipboardRef.current = data;
    setClipboard(data);
  }, []);

  const paste = useCallback(
    (
      targetStaffIdx: number,
      targetDateIdx: number,
      staffIds: string[],
      weekDays: string[],
    ): Array<{ staffId: string; date: string; value: string }> | null => {
      const clip = clipboardRef.current;
      if (!clip || clip.cells.length === 0) return null;

      const results: Array<{ staffId: string; date: string; value: string }> = [];
      for (const cell of clip.cells) {
        const sIdx = targetStaffIdx + cell.rowOff;
        const dIdx = targetDateIdx + cell.colOff;
        if (sIdx < 0 || dIdx < 0 || sIdx >= staffIds.length || dIdx >= weekDays.length) continue;
        results.push({
          staffId: staffIds[sIdx]!,
          date: weekDays[dIdx]!,
          value: cell.value,
        });
      }
      return results.length > 0 ? results : null;
    },
    [],
  );

  const hasClipboard = clipboard != null && clipboard.cells.length > 0;

  return { clipboard, copy, paste, hasClipboard };
}
