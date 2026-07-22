import { redirect } from "next/navigation";

export default function ReportsRedirectPage() {
  redirect("/admin/attendance?tab=history");
}
