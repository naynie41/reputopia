import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getServerApi } from "@/trpc/server";
import { AppSidebar } from "@/components/app-sidebar";

/**
 * Authenticated app shell. Gates: must be signed in and onboarded. Reads the current
 * user via the server-side tRPC caller (type-safe, same layer as the client).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const api = await getServerApi();
  const me = await api.profile.current();
  if (!me?.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={me.role} name={me.name} email={me.email} avatarUrl={me.avatarUrl} />
      <div className="flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}
