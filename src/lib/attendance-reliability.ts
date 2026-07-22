import type { DayIssueStats } from "@/lib/attendance-report";

export type ReliabilityTier = "excellent" | "good" | "fair" | "poor";

export type AttendanceReliability = {
  score: number;
  tier: ReliabilityTier;
};

export type ReliabilityInputRow = {
  missing_clock_out_days?: number;
  rejected_gps_count?: number;
  review_required_count?: number;
  issues: DayIssueStats;
  shift_performance?: {
    absent_count?: number;
    late_count?: number;
    early_leave_count?: number;
    reliability_percent?: number;
    daily?: Array<{ status: string }>;
  } | null;
};

function reliabilityTier(score: number): ReliabilityTier {
  return score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "poor";
}

/** Violation-based reliability — only absent, late, early leave, missing punches. */
export function attendanceReliability(row: ReliabilityInputRow): AttendanceReliability {
  const sp = row.shift_performance;
  if (sp?.reliability_percent != null) {
    const score = Math.max(0, Math.min(100, Math.round(sp.reliability_percent)));
    return { score, tier: reliabilityTier(score) };
  }

  let score = 100;
  score -= (sp?.absent_count ?? 0) * 5;
  score -= (sp?.late_count ?? 0) * 2;
  score -= (sp?.early_leave_count ?? 0) * 3;

  const daily = sp?.daily ?? [];
  const missingOut = daily.filter((d) => d.status === "missing_clock_out").length;
  const missingIn = daily.filter((d) => d.status === "missing_clock_in").length;
  score -= missingOut * 8;
  score -= missingIn * 5;

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, tier: reliabilityTier(score) };
}
