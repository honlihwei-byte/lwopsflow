/**
 * Apply 022_saas_rls_policies.sql when DATABASE_URL or SUPABASE_DB_URL is set.
 * Usage: node scripts/apply-migration-022.mjs
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

const env = { ...process.env, ...loadEnvLocal() };
const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL;

if (!dbUrl) {
  console.error(
    "apply-migration-022: set DATABASE_URL or SUPABASE_DB_URL in .env.local (Supabase → Settings → Database → connection string).",
  );
  process.exit(1);
}

const sqlPath = path.join(root, "supabase", "migrations", "022_saas_rls_policies.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("apply-migration-022: connected, applying migration…");
  await client.query(sql);
  console.log("apply-migration-022: OK");
} catch (e) {
  console.error("apply-migration-022: failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
