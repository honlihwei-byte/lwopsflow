import { redirect } from "next/navigation";

export default function SelfieVerificationRedirectPage() {
  redirect("/admin/shops?notice=security");
}
