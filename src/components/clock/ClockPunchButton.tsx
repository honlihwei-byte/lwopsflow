"use client";

import { useCallback, useState } from "react";

/** Large punch CTA — instant press feedback and visible processing state. */
export function ClockPunchButton({
  label,
  isClockIn,
  disabled,
  tapLocked,
  processing = false,
  onPunch,
}: {
  label: string;
  isClockIn: boolean;
  disabled: boolean;
  /** Double-tap guard — disables button while punch is in flight. */
  tapLocked?: boolean;
  /** Show spinner + processing label (tap response <300ms). */
  processing?: boolean;
  onPunch: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const locked = disabled || tapLocked === true;
  const canInteract = !locked;

  const setPressedSafe = useCallback(
    (value: boolean) => {
      if (!canInteract && value) return;
      setPressed(value);
    },
    [canInteract],
  );

  const baseColor = isClockIn
    ? "bg-emerald-600 ring-emerald-300 dark:ring-emerald-600"
    : "bg-red-600 ring-red-300 dark:bg-red-700 dark:ring-red-800";

  return (
    <button
      type="button"
      disabled={locked}
      onPointerDown={() => setPressedSafe(true)}
      onPointerUp={() => setPressedSafe(false)}
      onPointerLeave={() => setPressedSafe(false)}
      onPointerCancel={() => setPressedSafe(false)}
      onTouchStart={() => setPressedSafe(true)}
      onTouchEnd={() => setPressedSafe(false)}
      onTouchCancel={() => setPressedSafe(false)}
      onClick={() => {
        if (!canInteract) return;
        onPunch();
      }}
      className={[
        "flex w-full select-none items-center justify-center gap-2 rounded-xl py-4 text-lg font-semibold text-white shadow-sm",
        "touch-manipulation transition-[transform,opacity,box-shadow] duration-75",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        baseColor,
        canInteract && !pressed && !processing ? "ring-4" : "",
        pressed && canInteract ? "scale-[0.97] opacity-90" : "",
        processing ? "animate-pulse" : "",
      ].join(" ")}
      style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
      aria-busy={processing}
    >
      {processing ? (
        <>
          <span
            className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden
          />
          <span>{label}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
