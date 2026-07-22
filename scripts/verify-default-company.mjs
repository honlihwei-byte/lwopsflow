/**
 * Verify CMP-000001 default company and data links.
 * Usage: npm run verify:default-company
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

const env = { ...process.env, ...loadEnvLocal() };
const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL;

if (!dbUrl) {
  console.log("verify:default-company: skipped (no DATABASE_URL)");
  process.exit(0);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const { rows: companies } = await client.query(
    `select id, name, login_id, status, active, password_hash is not null as has_password
     from public.companies where upper(login_id) = 'CMP-000001'`,
  );
  if (companies.length === 0) {
    console.error("verify:default-company: CMP-000001 missing — run npm run migrate:025");
    process.exit(1);
  }
  const c = companies[0];
  if (c.name !== "Testing Company") {
    console.warn(`verify:default-company: name is "${c.name}" (expected Testing Company)`);
  }

  const { rows: codeRow } = await client.query(
    `select code from public.companies where id = $1`,
    [c.id],
  );
  if (codeRow[0]?.code?.toUpperCase() !== "CMP-000001") {
    console.error(`verify:default-company: code is "${codeRow[0]?.code}" (expected CMP-000001)`);
    process.exit(1);
  }
  if (!c.has_password) {
    console.error("verify:default-company: password_hash missing");
    process.exit(1);
  }

  const { rows: orphanShops } = await client.query(
    `select count(*)::int as n from public.shops where company_id is null`,
  );
  const { rows: linkedShops } = await client.query(
    `select count(*)::int as n from public.shops where company_id = $1`,
    [c.id],
  );
  const { rows: orphanStaff } = await client.query(
    `select count(*)::int as n from public.staff where company_id is null`,
  );
  const { rows: attendance } = await client.query(`select count(*)::int as n from public.attendance`);

  console.log("verify:default-company: OK");
  console.log(`  ${c.login_id}: ${c.name} (${c.status})`);
  console.log(`  shops linked: ${linkedShops[0].n}, orphan shops: ${orphanShops[0].n}`);
  console.log(`  orphan staff: ${orphanStaff[0].n}`);
  console.log(`  attendance rows (unchanged): ${attendance[0].n}`);

  if (orphanShops[0].n > 0) {
    console.error("verify:default-company: shops without company_id");
    process.exit(1);
  }
} catch (e) {
  console.error("verify:default-company failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
