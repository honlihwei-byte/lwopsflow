import type { Metadata } from "next";
import { EmailVerifiedSuccess } from "@/components/auth/EmailVerifiedSuccess";

export const metadata: Metadata = {
  title: "Email verified — LW OpsFlow",
};

export default function EmailVerifiedPage() {
  return <EmailVerifiedSuccess />;
}
