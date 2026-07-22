export const CONTEXTUAL_HELP = {
  authorizedStaff:
    "Only staff assigned to this shop can punch attendance here.",
  shiftTemplate:
    "Reusable working hours such as Morning, Noon, Full, or Part Time.",
  assignedShops:
    "Staff can only clock at shops you select. Assign every location they work at.",
  clockQr:
    "Staff scan this QR on-site to open the punch page. Regenerating invalidates old printed codes.",
  gpsIndoorMode:
    "Uses multiple GPS samples and confidence scoring — recommended for malls and high-rise buildings.",
  photoProofFallback:
    "Allows rear-camera location proof when GPS is unstable (requires Indoor Confidence Mode).",
  antiBuddyProtection:
    "Per-shop rules for selfie proof, device trust, and buddy-punch risk detection.",
  staffCode:
    "Short unique code shown on the clock screen and reports (e.g. MS04).",
} as const;

export type ContextualHelpKey = keyof typeof CONTEXTUAL_HELP;
