/**
 * Verify SaaS RLS migration: tables, functions, policies.
 * Usage: node scripts/verify-rls.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = val;
  }
  return out;
}

const migrationSql = fs.readFileSync(
  path.join(root, "supabase", "migrations", "022_saas_rls_policies.sql"),
  "utf8",
);

const requiredInMigration = [
  "create table if not exists public.subscriptions",
  "create table if not exists public.company_users",
  "auth_is_super_admin",
  "auth_is_company_admin",
  "auth_company_id",
  "companies_super_admin_all",
  "subscriptions_company_admin_all",
  "company_users_company_admin_select",
  "attendance_block_super_admin",
  "staff_block_super_admin",
  "shop_gps_locations_block_super_admin",
];

let failed = 0;
for (const token of requiredInMigration) {
  if (!migrationSql.includes(token)) {
    console.error(`verify-rls: migration missing: ${token}`);
    failed++;
  }
}
if (failed === 0) {
  console.log("verify-rls: migration file contains required policies.");
}

const env = { ...process.env, ...loadEnvLocal() };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("verify-rls: skip live DB (no Supabase URL/key).");
  process.exit(failed ? 1 : 0);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const table of ["companies", "subscriptions", "company_users"]) {
  const { error } = await supabase.from(table).select("id").limit(1);
  if (error) {
    console.error(`verify-rls: table ${table} probe failed:`, error.message);
    failed++;
  } else {
    console.log(`verify-rls: table ${table} OK`);
  }
}

const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL;
if (dbUrl) {
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();

    const { rows: rlsRows } = await client.query(`
      select c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('companies','subscriptions','company_users','attendance','staff')
      order by 1
    `);

    for (const row of rlsRows) {
      const ok = row.rls_enabled === true;
      console.log(`verify-rls: RLS on ${row.table_name}: ${ok ? "enabled" : "DISABLED"}`);
      if (!ok) failed++;
    }

    const { rows: policies } = await client.query(`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public'
        and tablename in ('companies','subscriptions','company_users','attendance','staff')
      order by tablename, policyname
    `);

    const mustHave = [
      ["companies", "companies_super_admin_all"],
      ["subscriptions", "subscriptions_company_admin_all"],
      ["company_users", "company_users_super_admin_all"],
      ["attendance", "attendance_block_super_admin"],
      ["staff", "staff_block_super_admin"],
    ];

    const found = new Set(policies.map((p) => `${p.tablename}:${p.policyname}`));
    for (const [t, p] of mustHave) {
      const key = `${t}:${p}`;
      if (!found.has(key)) {
        console.error(`verify-rls: missing policy ${key}`);
        failed++;
      } else {
        console.log(`verify-rls: policy ${key} OK`);
      }
    }

    await client.end();
  } catch (e) {
    console.error("verify-rls: live policy check failed:", e.message);
    failed++;
  }
} else {
  console.log("verify-rls: skip pg_policies check (set DATABASE_URL for full verify).");
}

process.exit(failed ? 1 : 0);
