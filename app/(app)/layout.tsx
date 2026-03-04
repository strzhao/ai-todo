import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-auth";
import { getSpacesByUser } from "@/lib/db";
import { SpaceNav } from "@/components/SpaceNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect("/auth/callback?error=unauthorized");

  const spaces = await getSpacesByUser(user.id);

  return (
    <div className="min-h-screen bg-background">
      <SpaceNav spaces={spaces} userEmail={user.email} />
      {/* Desktop: offset for sidebar; mobile: offset for bottom tab */}
      <main className="md:ml-52 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  );
}
