import { redirect } from "next/navigation";

export default function SecurityCenterRedirectPage() {
  redirect("/admin/shops?notice=security");
}
