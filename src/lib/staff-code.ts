const STAFF_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomStaffCodeSegment(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += STAFF_CODE_CHARS[Math.floor(Math.random() * STAFF_CODE_CHARS.length)]!;
  }
  return s;
}
