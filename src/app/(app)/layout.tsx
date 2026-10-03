import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  return <AppShell user={user}>{children}</AppShell>;
}
