import { redirect } from "next/navigation";

export default function GpsRiskRedirectPage() {
  redirect("/admin/shops?notice=security");
}
