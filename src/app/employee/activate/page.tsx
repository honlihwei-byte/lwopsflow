import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

/** Legacy query-string activation links → /activate/{token} */
export default async function LegacyEmployeeActivatePage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (token?.trim()) {
    redirect(`/activate/${encodeURIComponent(token.trim())}`);
  }
  redirect("/employee/login");
}
