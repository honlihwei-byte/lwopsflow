import { redirect } from "next/navigation";

export default function AttendanceSummaryRedirectPage() {
  redirect("/admin/attendance");
}
