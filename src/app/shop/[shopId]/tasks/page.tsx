import { StaffTasksPage } from "./StaffTasksPage";

export default async function ShopTasksRoute({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ staff_id?: string }>;
}) {
  const { shopId } = await params;
  const sp = await searchParams;
  const initialStaffId = sp.staff_id?.trim() ?? "";
  return <StaffTasksPage shopId={shopId} initialStaffId={initialStaffId} />;
}
