import { redirect } from "next/navigation";

export default function DeviceControlRedirectPage() {
  redirect("/admin/shops?notice=security");
}
