import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-auth";
import { getSpacesByUser, initDb, isUserActivated } from "@/lib/db";
import { SpaceNav } from "@/components/SpaceNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect("/auth/callback?error=unauthorized");

  if (process.env.AUTH_DEV_BYPASS !== "true") {
    await initDb();
    const activated = await isUserActivated(user.id);
    if (!activated) redirect("/activate");
  }

  const spaces = await getSpacesByUser(user.id);
  // Task objects have `title`; SpaceNav expects `name` (legacy Space shape)
  const spacesForNav = spaces.map((s) => ({ ...s, name: s.title }));

  return (
    <div className="min-h-screen bg-background">
      <SpaceNav spaces={spacesForNav} userEmail={user.email} isDev={process.env.AUTH_DEV_BYPASS === "true"} />
      {/* Desktop: offset for sidebar; mobile: offset for bottom tab */}
      <main className="md:ml-52 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  );
}
