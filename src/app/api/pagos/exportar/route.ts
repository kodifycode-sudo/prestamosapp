import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getPagosForUser, parsePagosFilters } from "@/lib/pagos-queries";

export const dynamic = "force-dynamic";

/**
 * Todos los pagos que cumplen los filtros de /pagos, sin el tope de la página,
 * para exportarlos a Excel. Mismo alcance por empresa/cobrador que la página.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const filters = parsePagosFilters({
    metodo: params.get("metodo"),
    cobrador: params.get("cobrador"),
    desde: params.get("desde"),
    hasta: params.get("hasta"),
    q: params.get("q"),
  });

  const pagos = await getPagosForUser(user, filters, { limite: null });
  return NextResponse.json(pagos);
}
