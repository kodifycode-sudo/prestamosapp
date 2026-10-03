import { NextResponse } from "next/server";
import { getUserFromToken } from "@/utils/getUserFromToken";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserFromToken();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
