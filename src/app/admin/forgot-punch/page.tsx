import { redirect } from "next/navigation";

export default function ForgotPunchRedirectPage() {
  redirect("/admin/attendance?tab=forgot");
}
