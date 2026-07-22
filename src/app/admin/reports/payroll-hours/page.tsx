import { redirect } from "next/navigation";

export default function PayrollHoursRedirectPage() {
  redirect("/admin/attendance?tab=history");
}
