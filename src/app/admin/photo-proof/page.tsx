import { redirect } from "next/navigation";

export default function PhotoProofRedirectPage() {
  redirect("/admin/shops?notice=security");
}
