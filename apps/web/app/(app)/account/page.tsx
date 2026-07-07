import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-auth";
import { initDb, getUserNickname } from "@/lib/db";
import { AccountContent } from "@/components/AccountContent";

export default async function AccountPage() {
  const user = await getServerUser();
  if (!user) redirect("/auth/callback?error=unauthorized");

  await initDb();
  const nickname = await getUserNickname(user.id);

  return (
    <AccountContent
      userEmail={user.email}
      userNickname={nickname ?? undefined}
      isDev={process.env.AUTH_DEV_BYPASS === "true"}
    />
  );
}
