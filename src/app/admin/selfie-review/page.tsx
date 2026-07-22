import { redirect } from "next/navigation";

export default function SelfieReviewRedirectPage() {
  redirect("/admin/shops?notice=security");
}
