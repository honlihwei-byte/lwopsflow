"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ClockErrorBoundary } from "@/components/ClockErrorBoundary";
import { sanitizeInternalReturnPath } from "@/lib/app-url";
import { CLOCK_ROUTE } from "@/lib/clock-routes";
import { normalizePunchQrToken } from "@/lib/punch-qr-url";
import { ClockScreenSkeleton } from "./ClockScreenSkeleton";

const ClockScreen = dynamic(
  () => import("./ClockScreen").then((m) => ({ default: m.ClockScreen })),
  {
    ssr: false,
    loading: () => <ClockScreenSkeleton />,
  },
);

type SessionState = "pending" | "authenticated" | "unauthenticated";

function buildClockReturnPath(shopId: string, punchQrToken: string | null): string {
  const path = CLOCK_ROUTE.canonical(shopId);
  if (!punchQrToken) return path;
  const qs = new URLSearchParams({ t: punchQrToken });
  return `${path}?${qs.toString()}`;
}

export function ClockPageClient({ shopId }: { shopId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const punchQrToken = normalizePunchQrToken(searchParams.get("t"));
  const returnPath = useMemo(
    () => buildClockReturnPath(shopId, punchQrToken),
    [shopId, punchQrToken],
  );

  const [sessionState, setSessionState] = useState<SessionState>(
    punchQrToken ? "pending" : "unauthenticated",
  );
  const [employeeSession, setEmployeeSession] = useState<{
    staffId: string;
    staffName: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession(): Promise<void> {
      try {
        const res = await fetch("/api/employee/auth/session", { credentials: "include" });
        const j = (await res.json()) as {
          authenticated?: boolean;
          staff_id?: string;
          staff_name?: string;
        };
        if (cancelled) return;
        if (j.authenticated && j.staff_id) {
          setEmployeeSession({
            staffId: j.staff_id,
            staffName: j.staff_name?.trim() || null,
          });
          setSessionState("authenticated");
          return;
        }
        setEmployeeSession(null);
        setSessionState("unauthenticated");
      } catch {
        if (cancelled) return;
        setEmployeeSession(null);
        setSessionState("unauthenticated");
      }
    }

    void loadSession();

    const onFocus = () => {
      void loadSession();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [shopId, punchQrToken]);

  useEffect(() => {
    if (!punchQrToken) return;
    if (sessionState !== "unauthenticated") return;
    const next = sanitizeInternalReturnPath(returnPath, "/employee/dashboard");
    router.replace(`/employee/login?next=${encodeURIComponent(next)}`);
  }, [punchQrToken, sessionState, returnPath, router]);

  if (punchQrToken && sessionState === "pending") {
    return <ClockScreenSkeleton />;
  }

  if (punchQrToken && sessionState === "unauthenticated") {
    return <ClockScreenSkeleton />;
  }

  return (
    <ClockErrorBoundary>
      <ClockScreen
        shopId={shopId}
        punchQrToken={punchQrToken}
        qrRequiresEmployeeLogin={Boolean(punchQrToken)}
        initialEmployeeSession={employeeSession}
      />
    </ClockErrorBoundary>
  );
}
