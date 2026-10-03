import { NextRequest, NextResponse } from "next/server";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { scopeEmpresa } from "@/lib/scope";
import { leerPaginacion } from "@/lib/paginacion";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const clienteId = request.nextUrl.searchParams.get("clienteId") ?? undefined;
  const prestamoId = request.nextUrl.searchParams.get("prestamoId") ?? undefined;

  const pagina = leerPaginacion(request.nextUrl.searchParams);
  const where = {
    ...scopeEmpresa(user),
    ...(prestamoId ? { prestamoId } : {}),
    ...(clienteId ? { prestamo: { clienteId } } : {}),
  };

  const pagos = await prisma.pago.findMany({
    where,
    ...pagina,
    include: {
      prestamo: { include: { cliente: { select: { id: true, nombre: true, apellido: true } } } },
      cuota: { select: { numero: true } },
    },
    orderBy: { fechaPago: "desc" },
  });

  if (!pagina.take) return NextResponse.json(pagos);
  const total = await prisma.pago.count({ where });
  return NextResponse.json(pagos, { headers: { "X-Total-Count": String(total) } });
}
