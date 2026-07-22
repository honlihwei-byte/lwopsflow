import dynamic from "next/dynamic";
import { I18nLoadingText } from "@/components/admin/I18nLoadingText";

const AddEmployeeForm = dynamic(
  () =>
    import("@/components/admin/staff/AddEmployeeForm").then((m) => ({
      default: m.AddEmployeeForm,
    })),
  {
    loading: () => <I18nLoadingText messageKey="loading.form" />,
  },
);

export default function AddEmployeePage() {
  return (
    <div className="px-4 py-8">
      <AddEmployeeForm />
    </div>
  );
}
