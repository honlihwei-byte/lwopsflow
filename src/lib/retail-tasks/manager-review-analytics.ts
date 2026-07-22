import type { TaskReviewDecision } from "@/lib/retail-tasks/types";

export type ManagerReviewStats = {
  verifier_id: string;
  verifier_name: string | null;
  total_reviews: number;
  accepted_count: number;
  fair_count: number;
  rejected_count: number;
  accept_rate: number;
  fair_rate: number;
  reject_rate: number;
  flags: ManagerReviewFlag[];
};

export type ManagerReviewFlag =
  | { code: "high_accept_rate"; message: string }
  | { code: "high_reject_rate"; message: string }
  | { code: "low_fair_usage"; message: string };

export const MANAGER_ANALYTICS_MIN_REVIEWS = 5;
export const MANAGER_HIGH_ACCEPT_THRESHOLD = 0.9;
export const MANAGER_HIGH_REJECT_THRESHOLD = 0.6;
export const MANAGER_LOW_FAIR_MAX_ACCEPT = 0.95;

type ReviewRow = {
  verifier_id: string | null;
  verifier_name?: string | null;
  decision: string;
};

function normalizeDecision(raw: string): TaskReviewDecision {
  if (raw === "fair" || raw === "rejected") return raw;
  return "accepted";
}

/**
 * Analytics-only manager bias detection. Does NOT override reviews.
 * AI / future insights should consume this output — never auto-change scores.
 */
export function computeManagerReviewAnalytics(
  rows: ReviewRow[],
): ManagerReviewStats[] {
  const byVerifier = new Map<
    string,
    { name: string | null; accepted: number; fair: number; rejected: number }
  >();

  for (const row of rows) {
    if (!row.verifier_id) continue;
    const id = row.verifier_id;
    const bucket = byVerifier.get(id) ?? {
      name: row.verifier_name ?? null,
      accepted: 0,
      fair: 0,
      rejected: 0,
    };
    if (row.verifier_name && !bucket.name) bucket.name = row.verifier_name;
    const decision = normalizeDecision(row.decision);
    if (decision === "fair") bucket.fair += 1;
    else if (decision === "rejected") bucket.rejected += 1;
    else bucket.accepted += 1;
    byVerifier.set(id, bucket);
  }

  const results: ManagerReviewStats[] = [];

  for (const [verifier_id, counts] of byVerifier) {
    const total = counts.accepted + counts.fair + counts.rejected;
    const accept_rate = total > 0 ? counts.accepted / total : 0;
    const fair_rate = total > 0 ? counts.fair / total : 0;
    const reject_rate = total > 0 ? counts.rejected / total : 0;

    const flags: ManagerReviewFlag[] = [];
    if (total >= MANAGER_ANALYTICS_MIN_REVIEWS) {
      if (accept_rate >= MANAGER_HIGH_ACCEPT_THRESHOLD) {
        flags.push({
          code: "high_accept_rate",
          message: `Accept rate ${Math.round(accept_rate * 100)}% — unusually high vs peers`,
        });
      }
      if (reject_rate >= MANAGER_HIGH_REJECT_THRESHOLD) {
        flags.push({
          code: "high_reject_rate",
          message: `Reject rate ${Math.round(reject_rate * 100)}% — unusually high vs peers`,
        });
      }
      if (accept_rate >= MANAGER_LOW_FAIR_MAX_ACCEPT && fair_rate < 0.05) {
        flags.push({
          code: "low_fair_usage",
          message: "Almost all reviews are Accept with no Fair ratings — possible leniency pattern",
        });
      }
    }

    results.push({
      verifier_id,
      verifier_name: counts.name,
      total_reviews: total,
      accepted_count: counts.accepted,
      fair_count: counts.fair,
      rejected_count: counts.rejected,
      accept_rate,
      fair_rate,
      reject_rate,
      flags,
    });
  }

  return results.sort((a, b) => b.total_reviews - a.total_reviews);
}
