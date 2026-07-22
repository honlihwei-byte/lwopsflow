/**
 * Smoke test: valid in→out sessions, duplicate punches ignored.
 * Run: node scripts/test-daily-hours.mjs
 */

function parseMalaysiaEventInstant(eventDate, eventTime) {
  const [y, m, d] = eventDate.split("-").map(Number);
  const [hh, mm] = eventTime.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

function sortByEventTime(rows) {
  return [...rows].sort(
    (a, b) =>
      parseMalaysiaEventInstant(a.event_date, a.event_time) -
      parseMalaysiaEventInstant(b.event_date, b.event_time),
  );
}

function computeValidPunchDay(rows) {
  const sorted = sortByEventTime(rows);
  let inside = false;
  let openIn = null;
  let firstValidIn;
  let lastValidOut;
  let totalMs = 0;

  for (const p of sorted) {
    if (p.action_type === "clock_in") {
      if (!inside) {
        inside = true;
        openIn = p;
        if (!firstValidIn) firstValidIn = p;
      }
      continue;
    }
    if (inside && openIn) {
      const inMs = parseMalaysiaEventInstant(openIn.event_date, openIn.event_time);
      const outMs = parseMalaysiaEventInstant(p.event_date, p.event_time);
      if (outMs > inMs) {
        totalMs += outMs - inMs;
        lastValidOut = p;
      }
      inside = false;
      openIn = null;
    }
  }

  return { firstValidIn, lastValidOut, openIn: inside ? openIn : undefined, totalMs };
}

const date = "2026-05-21";
const rows = [
  { action_type: "clock_in", event_date: date, event_time: "12:33" },
  { action_type: "clock_in", event_date: date, event_time: "19:23" },
  { action_type: "clock_out", event_date: date, event_time: "19:23" },
  { action_type: "clock_in", event_date: date, event_time: "20:10" },
  { action_type: "clock_out", event_date: date, event_time: "21:04" },
];

const day = computeValidPunchDay(rows);
const session1 = parseMalaysiaEventInstant(date, "19:23") - parseMalaysiaEventInstant(date, "12:33");
const session2 = parseMalaysiaEventInstant(date, "21:04") - parseMalaysiaEventInstant(date, "20:10");
const expectedMs = session1 + session2;

let failed = 0;

if (day.totalMs !== expectedMs) {
  console.error(`FAIL total: got ${day.totalMs} expected ${expectedMs}`);
  failed++;
} else {
  const h = Math.floor(day.totalMs / 3600000);
  const m = Math.floor((day.totalMs % 3600000) / 60000);
  console.log(`OK total valid sessions: ${h}h ${m}m`);
}

if (day.firstValidIn?.event_time !== "12:33") {
  console.error("FAIL first valid in");
  failed++;
} else {
  console.log("OK first valid in: 12:33");
}

if (day.lastValidOut?.event_time !== "21:04") {
  console.error("FAIL last valid out");
  failed++;
} else {
  console.log("OK last valid out: 21:04");
}

// duplicate 19:23 in must not replace 12:33 session start
if (session1 !== 6 * 3600000 + 50 * 60000) {
  console.error(`FAIL session1 duration: ${session1}`);
  failed++;
}

// leading duplicate out ignored
const dupOutOnly = computeValidPunchDay([
  { action_type: "clock_out", event_date: date, event_time: "09:00" },
  { action_type: "clock_in", event_date: date, event_time: "10:00" },
  { action_type: "clock_out", event_date: date, event_time: "18:00" },
]);
if (dupOutOnly.totalMs !== 8 * 3600000) {
  console.error("FAIL ignored leading clock-out");
  failed++;
} else {
  console.log("OK ignored duplicate clock-out while outside");
}

// open in adds no hours
const openIn = computeValidPunchDay([
  { action_type: "clock_in", event_date: date, event_time: "09:00" },
]);
if (openIn.totalMs !== 0 || !openIn.openIn) {
  console.error("FAIL unmatched clock-in adds no hours");
  failed++;
} else {
  console.log("OK unmatched clock-in: 0 hours");
}

process.exit(failed ? 1 : 0);
