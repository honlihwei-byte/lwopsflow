/**
 * Apply 031_shop_scheduling.sql
 * Usage: npm run migrate:031
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
  console.error("migrate:031: set DATABASE_URL in .env.local");
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(root, "supabase", "migrations", "031_shop_scheduling.sql"),
  "utf8",
);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log("migrate:031: applied successfully");
} catch (e) {
  console.error("migrate:031 failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
