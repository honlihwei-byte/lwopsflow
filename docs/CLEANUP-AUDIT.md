# Project cleanup audit (2026-05-21)

Audit scope: `src/`, `scripts/` (app code only). No schema or QR route changes.

## SAFE TO DELETE (removed in safe-cleanup-pass)

| Path | Reason |
|------|--------|
| `src/components/admin/AdminPinGate.tsx` | Zero imports; superseded by `AdminSessionGate` + cookie auth |
| `src/lib/admin-pin.ts` | Only used by `AdminPinGate` |
| `src/lib/attendance-audit.ts` | `parseClientDeviceTime` never imported; enrich route inlines parsing |
| `src/components/PunchLoadingOverlay.tsx` | Zero imports |
| `src/components/admin/AdminLoginForm.tsx` | Zero imports; `/admin/login` redirects to `/login` |

Also removed dead `validateRandomSelfiePathExists` from `punch-risk-insert.ts`.

## POSSIBLY UNUSED (kept — external links / legacy)

| Path | Notes |
|------|--------|
| `/attendance` route | Duplicate of `/admin`; **now redirects to `/admin`** |
| `/clock/[shopId]` | Legacy QR alias; same UI as `/shop/[id]/clock` — **do not remove** |
| `/shops/[shopId]/*` | Redirect aliases — **do not remove** |
| `scripts/test-default-login.mjs`, `scripts/test-daily-hours.mjs` | Dev ops scripts, not app demos |
| `src/app/clock/page.tsx` | Marketing help page (not punch UI); linked from homepage |

## SHARED / DO NOT DELETE

- **QR**: `api/shops/[shopId]/qr-token`, `punch-qr-*`, `QrCodePanel`, `clock-routes.ts`, all `/shop/.../clock` and `/clock/[shopId]` routes
- **Attendance**: `api/attendance/*`, `attendance*.ts`, `smart-punch*`, `staff-day-status`, `shift-attendance-report`
- **GPS**: `gps-shop-verify`, `geolocation-client`, `clock-verified-gps`, `location-confidence`, indoor fallback/session/trust
- **Photo proof**: `photo-proof-*`, admin photo-proof review
- **Anti-buddy**: `punch-risk*`, `punch-device*`, migration 029, risk review
- **SaaS**: `company*`, `billing`, `subscription*`, auth routes, super-admin
- **Staff schedules**: `staff-schedule*`, migration 028
- **Supabase**: `lib/supabase/*`, all migrations
- **Admin reports**: `AttendanceReportPanel`, `MonthReportView`, `api/admin/report` (technical GPS labels preserved)

## Duplicate logic (kept — layered by design)

| Area | Modules | Action |
|------|---------|--------|
| GPS verify | `geolocation-client` → `clock-verified-gps` → `gps-shop-verify` | Client/server split; not merged |
| Punch validation | `attendance-punch.ts` used by all punch APIs | Single shared module ✓ |
| Report issues | `attendance-issues` + `attendance-report` + `shift-attendance-report` | Different consumers |
| Staff vs admin labels | `staff-punch-display` vs `gpsStatusLabel` | Intentional staff-friendly vs admin technical |

## Large files (>500 lines)

| Lines | File | Action this pass |
|------:|------|------------------|
| ~1294 | `ClockScreen.tsx` | Kept; split deferred (high regression risk) |
| ~902 | `geolocation-client.ts` | Kept |
| ~809 | `AttendanceReportPanel.tsx` | Lazy-loaded on admin dashboard |
| ~743 | `clock-verified-gps.ts` | Kept |
| ~669 | `gps-shop-verify.ts` | Kept |

## Optimizations applied

- Dynamic import: `AttendanceReportPanel`, `StaffManager`, `ShopManager`, `AddEmployeeForm`
- `/attendance` → redirect `/admin`
- Removed dead code files listed above
