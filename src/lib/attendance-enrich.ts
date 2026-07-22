/** Seconds between device clock and server punch time (audit). */
export function computeTimeDifferenceSeconds(
  clientDeviceTimeIso: string,
  serverCreatedAtIso: string,
): number | null {
  const clientMs = Date.parse(clientDeviceTimeIso);
  const serverMs = Date.parse(serverCreatedAtIso);
  if (!Number.isFinite(clientMs) || !Number.isFinite(serverMs)) return null;
  return Math.round(Math.abs(clientMs - serverMs) / 1000);
}

export function buildEnrichAuditNotes(opts: {
  accuracyMeters: number | null;
  weakGps: boolean;
}): string {
  const parts: string[] = ["background_enrich"];
  if (opts.accuracyMeters != null) {
    parts.push(`accuracy_m=${Math.round(opts.accuracyMeters)}`);
  }
  if (opts.weakGps) parts.push("weak_gps");
  return parts.join("; ");
}
