import type { ShopShiftTemplate } from "../ShopShiftTemplatesPanel";

export type ShiftColorKey =
  | "morning"
  | "noon"
  | "full"
  | "half"
  | "off"
  | "annual"
  | "medical"
  | "rest"
  | "training"
  | "conflict"
  | "empty"
  | "elsewhere";

export const SHIFT_COLORS: Record<
  ShiftColorKey,
  { bg: string; text: string; border: string; hover: string }
> = {
  morning: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-900 dark:text-blue-100",
    border: "border-blue-200 dark:border-blue-800",
    hover: "hover:bg-blue-100 dark:hover:bg-blue-900/50",
  },
  noon: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-900 dark:text-emerald-100",
    border: "border-emerald-200 dark:border-emerald-800",
    hover: "hover:bg-emerald-100 dark:hover:bg-emerald-900/50",
  },
  full: {
    bg: "bg-blue-100 dark:bg-blue-900/60",
    text: "text-blue-950 dark:text-blue-50",
    border: "border-blue-400 dark:border-blue-700",
    hover: "hover:bg-blue-200 dark:hover:bg-blue-800/60",
  },
  half: {
    bg: "bg-cyan-50 dark:bg-cyan-950/40",
    text: "text-cyan-900 dark:text-cyan-100",
    border: "border-cyan-200 dark:border-cyan-800",
    hover: "hover:bg-cyan-100 dark:hover:bg-cyan-900/50",
  },
  off: {
    bg: "bg-zinc-100 dark:bg-zinc-800/60",
    text: "text-zinc-600 dark:text-zinc-300",
    border: "border-zinc-200 dark:border-zinc-700",
    hover: "hover:bg-zinc-200 dark:hover:bg-zinc-700/60",
  },
  annual: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-900 dark:text-orange-100",
    border: "border-orange-200 dark:border-orange-800",
    hover: "hover:bg-orange-100 dark:hover:bg-orange-900/50",
  },
  medical: {
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-900 dark:text-purple-100",
    border: "border-purple-200 dark:border-purple-800",
    hover: "hover:bg-purple-100 dark:hover:bg-purple-900/50",
  },
  rest: {
    bg: "bg-sky-50 dark:bg-sky-950/40",
    text: "text-sky-800 dark:text-sky-100",
    border: "border-sky-200 dark:border-sky-800",
    hover: "hover:bg-sky-100 dark:hover:bg-sky-900/50",
  },
  training: {
    bg: "bg-violet-50 dark:bg-violet-950/40",
    text: "text-violet-900 dark:text-violet-100",
    border: "border-violet-200 dark:border-violet-800",
    hover: "hover:bg-violet-100 dark:hover:bg-violet-900/50",
  },
  conflict: {
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-900 dark:text-red-100",
    border: "border-red-300 dark:border-red-700",
    hover: "hover:bg-red-100 dark:hover:bg-red-900/50",
  },
  empty: {
    bg: "bg-white dark:bg-zinc-950",
    text: "text-zinc-400 dark:text-zinc-500",
    border: "border-zinc-100 dark:border-zinc-800",
    hover: "hover:bg-zinc-50 dark:hover:bg-zinc-900",
  },
  elsewhere: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-900 dark:text-amber-100",
    border: "border-amber-200 dark:border-amber-800",
    hover: "hover:bg-amber-100 dark:hover:bg-amber-900/40",
  },
};

const LEAVE_COLOR_MAP: Record<string, ShiftColorKey> = {
  RD: "rest",
  AL: "annual",
  MC: "medical",
  UL: "off",
  EL: "training",
  NS: "off",
};

function matchTemplateKey(name: string): ShiftColorKey | null {
  const n = name.toLowerCase();
  if (n.includes("morning") || n.includes("am")) return "morning";
  if (n.includes("noon") || n.includes("pm") || n.includes("afternoon")) return "noon";
  if (n.includes("full")) return "full";
  if (n.includes("half")) return "half";
  return null;
}

export function resolveShiftColorKey(
  value: string,
  templates: ShopShiftTemplate[],
  state: "empty" | "off" | "here" | "elsewhere" | "conflict",
): ShiftColorKey {
  if (state === "conflict") return "conflict";
  if (state === "elsewhere") return "elsewhere";
  if (state === "empty") return "empty";
  if (value === "__off__" || value === "RD") return "rest";
  if (LEAVE_COLOR_MAP[value]) return LEAVE_COLOR_MAP[value]!;
  const tpl = templates.find((t) => t.id === value);
  if (tpl) {
    const key = matchTemplateKey(tpl.name);
    if (key) return key;
    return "morning";
  }
  if (state === "off") return "off";
  return "empty";
}

export function cellColorClasses(key: ShiftColorKey): string {
  const c = SHIFT_COLORS[key];
  return `${c.bg} ${c.text} ${c.border} ${c.hover}`;
}
