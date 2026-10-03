import { NextResponse } from "next/server";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getDashboardStats } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const stats = await getDashboardStats(user);
  return NextResponse.json(stats);
}
