/**
 * Verifies photo-proof / indoor GPS columns exist in migration SQL and (when configured) in Supabase.
 * Run before build: npm run verify-schema
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const REQUIRED = {
  shops: ["allow_photo_proof_fallback", "gps_indoor_mode"],
  attendance: [
    "audit_notes",
    "photo_proof_used",
    "photo_proof_path",
    "photo_proof_uploaded_at",
    "photo_proof_original_file_size",
    "photo_proof_compressed_file_size",
    "photo_proof_upload_duration_ms",
    "verification_method",
    "review_required",
  ],
  staff_schedules: [
    "company_id",
    "shop_id",
    "staff_id",
    "shift_date",
    "start_time",
    "end_time",
    "break_minutes",
    "repeat_type",
    "status",
  ],
  staff_schedules_v031: ["is_off_day", "template_id"],
  staff_schedules_v074: ["schedule_type", "sequence_no"],
  shops_scheduling: ["work_time_mode", "opening_time", "closing_time", "break_minutes"],
};

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function verifyMigrationFiles() {
  const dir = path.join(root, "supabase", "migrations");
  if (!fs.existsSync(dir)) {
    console.error("verify-schema: missing supabase/migrations/");
    process.exit(1);
  }
  const sql = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");

  const missing = [];
  for (const col of REQUIRED.shops) {
    if (!sql.includes(col)) missing.push(`shops.${col}`);
  }
  for (const col of REQUIRED.attendance) {
    if (!sql.includes(col)) missing.push(`attendance.${col}`);
  }
  for (const col of REQUIRED.staff_schedules) {
    if (!sql.includes(col)) missing.push(`staff_schedules.${col}`);
  }
  for (const col of REQUIRED.staff_schedules_v031) {
    if (!sql.includes(col)) missing.push(`staff_schedules.${col} (031)`);
  }
  for (const col of REQUIRED.staff_schedules_v074) {
    if (!sql.includes(col)) missing.push(`staff_schedules.${col} (074)`);
  }
  for (const col of REQUIRED.shops_scheduling) {
    if (!sql.includes(col)) missing.push(`shops.${col}`);
  }

  const files = fs.readdirSync(dir);
  const hasPhotoProofMigrationFile = files.some(
    (f) =>
      /015.*photo.*proof/i.test(f) ||
      /016.*photo.*proof/i.test(f) ||
      /018.*audit_notes/i.test(f),
  );
  if (!hasPhotoProofMigrationFile) {
    missing.push("migration file: 015 or 016 photo proof");
  }

  const hasSaasRls = files.some((f) => /022.*saas.*rls/i.test(f));
  if (!sql.includes("subscriptions")) {
    missing.push("migration: subscriptions table (022_saas_rls_policies.sql)");
  }
  if (!sql.includes("company_users")) {
    missing.push("migration: company_users table (022_saas_rls_policies.sql)");
  }
  if (!sql.includes("auth_is_super_admin")) {
    missing.push("migration: RLS helpers (022_saas_rls_policies.sql)");
  }
  if (!sql.includes("extra_shops")) {
    missing.push("subscriptions.extra_shops (035 or 052 migration)");
  }

  if (missing.length > 0) {
    console.error("verify-schema: migrations missing definitions for:");
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }
  console.log("verify-schema: migration files include required columns.");
}

async function verifyLiveDatabase() {
  const env = { ...process.env, ...loadEnvLocal() };
  if (env.SKIP_SCHEMA_LIVE_VERIFY === "1" || env.SKIP_SCHEMA_LIVE_VERIFY === "true") {
    console.log("verify-schema: skip live DB check (SKIP_SCHEMA_LIVE_VERIFY is set).");
    return;
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "verify-schema: skip live DB check (set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local).",
    );
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const shopCols = REQUIRED.shops.join(", ");
  const { error: shopErr } = await supabase.from("shops").select(shopCols).limit(0);
  if (shopErr) {
    console.error("verify-schema: shops probe failed:", shopErr.message);
    if (shopErr.code === "42703" || /does not exist/i.test(shopErr.message ?? "")) {
      console.error(
        "Apply migrations in Supabase SQL Editor or CLI:\n" +
          "  supabase/migrations/018_attendance_audit_notes_photo_proof.sql",
      );
    }
    process.exit(1);
  }

  const attCols = REQUIRED.attendance.join(", ");
  const { error: attErr } = await supabase.from("attendance").select(attCols).limit(0);
  if (attErr) {
    console.error("verify-schema: attendance probe failed:", attErr.message);
    if (attErr.code === "42703" || /does not exist/i.test(attErr.message ?? "")) {
      console.error(
        "Apply migrations:\n" +
          "  supabase/migrations/018_attendance_audit_notes_photo_proof.sql",
      );
    }
    process.exit(1);
  }

  const schedCols = REQUIRED.staff_schedules.join(", ");
  const { error: schedErr } = await supabase.from("staff_schedules").select(schedCols).limit(0);
  if (schedErr) {
    console.error("verify-schema: staff_schedules probe failed:", schedErr.message);
    if (schedErr.code === "42P01" || /does not exist/i.test(schedErr.message ?? "")) {
      console.error(
        "Apply migration:\n" +
          "  supabase/migrations/030_staff_schedules.sql",
      );
    }
    process.exit(1);
  }

  const v031SchedCols = [...REQUIRED.staff_schedules_v031].join(", ");
  const { error: v031SchedErr } = await supabase.from("staff_schedules").select(v031SchedCols).limit(0);
  if (v031SchedErr) {
    console.warn("verify-schema: staff_schedules v031 columns missing:", v031SchedErr.message);
    console.warn("Apply migration: supabase/migrations/031_shop_scheduling.sql");
  }

  const v074SchedCols = [...REQUIRED.staff_schedules_v074].join(", ");
  const { error: v074SchedErr } = await supabase.from("staff_schedules").select(v074SchedCols).limit(0);
  if (v074SchedErr) {
    console.warn("verify-schema: staff_schedules v074 columns missing:", v074SchedErr.message);
    console.warn("Apply migration: supabase/migrations/074_schedule_type_multi_shift.sql");
  }

  const shopSchedCols = REQUIRED.shops_scheduling.join(", ");
  const { error: shopSchedErr } = await supabase.from("shops").select(shopSchedCols).limit(0);
  if (shopSchedErr) {
    console.warn("verify-schema: shops scheduling columns missing:", shopSchedErr.message);
    console.warn("Apply migration: supabase/migrations/031_shop_scheduling.sql");
  } else {
    const { error: tplErr } = await supabase.from("shop_shift_templates").select("id, shop_id, name").limit(0);
    if (tplErr) {
      console.warn("verify-schema: shop_shift_templates missing:", tplErr.message);
      console.warn("Apply migration: supabase/migrations/031_shop_scheduling.sql");
    }
  }

  const companySecurityCols =
    "selfie_proof_mode, device_enforcement_mode, random_selfie_enabled, payroll_mode";
  const { error: companyErr } = await supabase.from("companies").select(companySecurityCols).limit(0);
  if (companyErr) {
    console.warn("verify-schema: companies security columns missing:", companyErr.message);
    console.warn(
      "Apply migration: supabase/migrations/048_companies_security_columns_repair.sql",
    );
  }

  const subscriptionAddonCols = "max_shops, extra_shops, extra_staff_packs";
  const { error: subErr } = await supabase
    .from("subscriptions")
    .select(subscriptionAddonCols)
    .limit(0);
  if (subErr) {
    console.warn("verify-schema: subscriptions plan add-on columns missing:", subErr.message);
    console.warn(
      "Apply migration: supabase/migrations/052_subscriptions_plan_addons_repair.sql",
    );
  }

  console.log("verify-schema: live database has required shops and attendance columns.");
}

verifyMigrationFiles();
await verifyLiveDatabase();
