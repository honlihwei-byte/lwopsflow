/**
 * Verify default company password hash matches app verifier.
 * Usage: npm run test:default-login
 */
import { scryptSync, timingSafeEqual } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function verifyPassword(password, stored) {
  if (!stored?.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const expectedHex = parts[2];
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

const sql026 = fs.readFileSync(
  path.join(root, "supabase", "migrations", "026_fix_default_company_login.sql"),
  "utf8",
);
const sql025 = fs.readFileSync(
  path.join(root, "supabase", "migrations", "025_default_company_cmp_000001.sql"),
  "utf8",
);
const sql = sql026 + sql025;
const match = sql.match(/'scrypt:[^']+'/);
if (!match) {
  console.error("test:default-login: hash not found in migration");
  process.exit(1);
}
const hash = match[0].slice(1, -1);
const password = process.env.DEFAULT_COMPANY_PASSWORD || "Wei82797892";

if (!verifyPassword(password, hash)) {
  console.error("test:default-login: password does not match migration hash");
  process.exit(1);
}
console.log("test:default-login: OK (hash verifies)");
