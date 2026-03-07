import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-auth";
import { AccountContent } from "@/components/AccountContent";

export default async function AccountPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/callback?error=unauthorized");

  return (
    <AccountContent
      userEmail={user.email}
      isDev={process.env.AUTH_DEV_BYPASS === "true"}
    />
  );
}
