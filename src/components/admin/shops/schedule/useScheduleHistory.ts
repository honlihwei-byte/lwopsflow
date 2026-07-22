"use client";

import { useCallback, useRef, useState } from "react";
import type { CellCoord } from "./schedule-utils";

export type UndoAction = {
  cells: Array<CellCoord & { previousValue: string }>;
  newValue: string;
};

export function useScheduleHistory() {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  const pendingRef = useRef<UndoAction | null>(null);

  const pushAction = useCallback((action: UndoAction) => {
    setUndoStack((s) => [...s.slice(-49), action]);
    setRedoStack([]);
  }, []);

  const startBatch = useCallback(() => {
    pendingRef.current = { cells: [], newValue: "" };
  }, []);

  const addToBatch = useCallback((cell: CellCoord & { previousValue: string }, newValue: string) => {
    if (!pendingRef.current) {
      pendingRef.current = { cells: [cell], newValue };
      return;
    }
    pendingRef.current.cells.push(cell);
    pendingRef.current.newValue = newValue;
  }, []);

  const commitBatch = useCallback(() => {
    if (pendingRef.current && pendingRef.current.cells.length > 0) {
      pushAction(pendingRef.current);
    }
    pendingRef.current = null;
  }, [pushAction]);

  const undo = useCallback((): UndoAction | null => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return null;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, action]);
    return action;
  }, [undoStack]);

  const redo = useCallback((): UndoAction | null => {
    const action = redoStack[redoStack.length - 1];
    if (!action) return null;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, action]);
    return action;
  }, [redoStack]);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    pushAction,
    startBatch,
    addToBatch,
    commitBatch,
    undo,
    redo,
  };
}
