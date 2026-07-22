import { redirect } from "next/navigation";

/** Legacy URL — same dashboard as `/admin`. */
export default function AttendancePage() {
  redirect("/admin");
}
