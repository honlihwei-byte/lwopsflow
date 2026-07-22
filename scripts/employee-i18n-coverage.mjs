/**
 * Employee portal i18n coverage report.
 * Run: node scripts/employee-i18n-coverage.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

const EMPLOYEE_PATHS = [
  "src/app/employee",
  "src/components/employee",
  "src/components/clock/StaffTodayStatusCard.tsx",
  "src/components/clock/ForgotPunchRequestDialog.tsx",
  "src/components/clock/ClockTodayTasksPanel.tsx",
  "src/components/LocationStatusCard.tsx",
  "src/app/shop/[shopId]/clock/ClockScreen.tsx",
  "src/app/shop/[shopId]/clock/schedule/page.tsx",
];

const HARDCODED_PATTERNS = [
  />\s*[A-Z][a-z]+(\s+[A-Za-z]+){0,4}\s*</g,
  /"(Today|My Schedule|Clock In|Clock Out|Current shift|Next shift|Forgot Punch|Early Leave|Location approved|This week|Next week|Loading\.\.\.|Failed to load)[^"]*"/g,
  /'Today[^']*'/g,
];

function flattenKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") keys.push(...flattenKeys(v, path));
    else keys.push(path);
  }
  return keys;
}

function loadEmployeeCatalog(file) {
  const raw = readFileSync(join(ROOT, file), "utf8");
  const match = raw.match(/export const employee\w+ = (\{[\s\S]*\});/);
  if (!match) return [];
  const obj = Function(`"use strict"; return (${match[1]});`)();
  return flattenKeys(obj).map((k) => `employee.${k}`);
}

function collectFiles(target) {
  const abs = join(ROOT, target.replace(/^src\//, "src/"));
  const out = [];
  function walk(p) {
    const st = statSync(p);
    if (st.isFile() && /\.(tsx|ts)$/.test(p)) {
      out.push(p);
      return;
    }
    if (!st.isDirectory()) return;
    for (const name of readdirSync(p)) {
      if (name === "node_modules") continue;
      walk(join(p, name));
    }
  }
  try {
    walk(abs);
  } catch {
    /* single file path */
    if (statSync(abs).isFile()) out.push(abs);
  }
  return out;
}

const enKeys = new Set(loadEmployeeCatalog("src/lib/i18n/employee-en.ts"));
const msKeys = new Set(
  loadEmployeeCatalog("src/lib/i18n/employee-ms.ts").map((k) => k),
);
const zhKeys = new Set(
  loadEmployeeCatalog("src/lib/i18n/employee-zh.ts").map((k) => k),
);

const files = [...new Set(EMPLOYEE_PATHS.flatMap(collectFiles))];
const hardcodedHits = [];

for (const file of files) {
  const content = readFileSync(file, "utf8");
  if (!/\.tsx$/.test(file)) continue;
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  for (const pattern of HARDCODED_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const snippet = m[0].slice(0, 80);
      if (snippet.includes("t(") || snippet.includes("className")) continue;
      hardcodedHits.push({ file: rel, snippet });
    }
  }
}

const msMissing = [...enKeys].filter((k) => !msKeys.has(k));
const zhMissing = [...enKeys].filter((k) => !zhKeys.has(k));
const localeCoverage =
  enKeys.size === 0
    ? 100
    : Math.round(
        ((enKeys.size - Math.max(msMissing.length, zhMissing.length)) / enKeys.size) * 100,
      );

const newSections = [
  "employee.common",
  "employee.status",
  "employee.punchLog",
  "employee.schedule",
  "employee.forgotPunch",
  "employee.location",
];

console.log("=== Employee Portal i18n Coverage Report ===\n");
console.log(`Translation keys (en): ${enKeys.size}`);
console.log(`MS coverage: ${msKeys.size}/${enKeys.size} (${Math.round((msKeys.size / enKeys.size) * 100)}%)`);
console.log(`ZH coverage: ${zhKeys.size}/${enKeys.size} (${Math.round((zhKeys.size / enKeys.size) * 100)}%)`);
console.log(`Overall locale parity: ${localeCoverage}%\n`);

console.log("New translation sections:");
for (const s of newSections) {
  const count = [...enKeys].filter((k) => k.startsWith(s)).length;
  console.log(`  ${s}: ${count} keys`);
}

if (msMissing.length) {
  console.log(`\nMissing in MS (${msMissing.length}):`);
  msMissing.slice(0, 10).forEach((k) => console.log(`  - ${k}`));
}
if (zhMissing.length) {
  console.log(`\nMissing in ZH (${zhMissing.length}):`);
  zhMissing.slice(0, 10).forEach((k) => console.log(`  - ${k}`));
}

console.log(`\nFiles scanned: ${files.length}`);
const byFile = new Map();
for (const hit of hardcodedHits) {
  if (!byFile.has(hit.file)) byFile.set(hit.file, []);
  byFile.get(hit.file).push(hit.snippet);
}
console.log(`Potential hardcoded UI strings: ${hardcodedHits.length}`);
for (const [file, snippets] of [...byFile.entries()].slice(0, 15)) {
  console.log(`  ${file}`);
  [...new Set(snippets)].slice(0, 3).forEach((s) => console.log(`    ${s.trim()}`));
}

console.log("\n=== End report ===");
