import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-auth";
import { getSpacesByUser, getOrgsForUser, initDb, getUserActivation } from "@/lib/db";
import { SpaceNav } from "@/components/SpaceNav";
import { PushPromptBanner } from "@/components/PushPromptBanner";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect("/auth/callback?error=unauthorized");

  await initDb();

  if (process.env.AUTH_DEV_BYPASS !== "true") {
    const { activated, nickname } = await getUserActivation(user.id);
    if (!activated) redirect("/activate");
    user.nickname = nickname ?? undefined;
  }

  const spaces = await getSpacesByUser(user.id);
  const orgs = await getOrgsForUser(user.id);
  // Task objects have `title`; SpaceNav expects `name` (legacy Space shape)
  const spacesForNav = spaces.map((s) => ({ ...s, name: s.title }));

  return (
    <div className="min-h-screen bg-background">
      <SpaceNav spaces={spacesForNav} orgs={orgs} userEmail={user.email} userNickname={user.nickname} isDev={process.env.AUTH_DEV_BYPASS === "true"} />
      {/* Desktop: offset for sidebar; mobile: offset for bottom tab */}
      <main className="main-content pb-16 md:pb-0">
        <PushPromptBanner />
        <PWAInstallBanner />
        {children}
      </main>
    </div>
  );
}
