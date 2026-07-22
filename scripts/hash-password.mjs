/**
 * Print scrypt hash for migrations. Usage: node scripts/hash-password.mjs "your-password"
 */
import { randomBytes, scryptSync } from "crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");
console.log(`scrypt:${salt}:${hash}`);
