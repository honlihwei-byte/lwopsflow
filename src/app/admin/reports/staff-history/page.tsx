import { redirect } from "next/navigation";

export default function StaffHistoryRedirectPage() {
  redirect("/admin/attendance?tab=history");
}
