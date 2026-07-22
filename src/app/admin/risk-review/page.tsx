import { redirect } from "next/navigation";

export default function RiskReviewRedirectPage() {
  redirect("/admin/shops?notice=security");
}
