"use client";

import { useCallback, useState } from "react";

export type AdminToastVariant = "success" | "error" | "warning";

export function useAdminToast() {
  const [toast, setToast] = useState<{ message: string; variant: AdminToastVariant } | null>(
    null,
  );

  const showSuccess = useCallback((message: string) => {
    setToast({ message, variant: "success" });
  }, []);

  const showError = useCallback((message: string) => {
    setToast({ message, variant: "error" });
  }, []);

  const showWarning = useCallback((message: string) => {
    setToast({ message, variant: "warning" });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, showSuccess, showError, showWarning, dismiss };
}
