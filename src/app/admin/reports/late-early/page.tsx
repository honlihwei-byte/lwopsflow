import { redirect } from "next/navigation";

export default function LateEarlyRedirectPage() {
  redirect("/admin/attendance?tab=history");
}
