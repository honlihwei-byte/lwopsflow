"use client";

import { EmployeeSessionGate } from "@/components/employee/EmployeeSessionGate";
import { OperationsCenterDetailClient } from "@/components/employee/operations-center/OperationsCenterDetailClient";

export default function EmployeeOperationsCenterDetailPage() {
  return (
    <EmployeeSessionGate>
      <OperationsCenterDetailClient />
    </EmployeeSessionGate>
  );
}
