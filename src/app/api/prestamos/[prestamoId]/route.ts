import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken, type TokenPayload } from "@/utils/getUserFromToken";
import { auditDelete, auditUpdate } from "@/utils/auditoria";

export const dynamic = "force-dynamic";

const prestamoUpdateSchema = z.object({
  // ATRASADO no se asigna a mano: se calcula según las cuotas vencidas (lib/estado-prestamo).
  estado: z.enum(["ACTIVO", "PAGADO", "CANCELADO"]),
});

async function getPrestamoScoped(prestamoId: string, user: TokenPayload) {
  const prestamo = await prisma.prestamo.findUnique({ where: { id: prestamoId } });
  if (!prestamo || prestamo.empresaId !== user.empresaId) return { prestamo: null, forbidden: false };
  if (user.rol === "COBRADOR" && prestamo.usuarioId !== user.usuarioId) {
    return { prestamo: null, forbidden: true };
  }
  return { prestamo, forbidden: false };
}

export async function GET(request: NextRequest, props: { params: Promise<{ prestamoId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { prestamo, forbidden } = await getPrestamoScoped(params.prestamoId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!prestamo) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });

  const cliente = await prisma.cliente.findUnique({ where: { id: prestamo.clienteId } });
  const cuotas = await prisma.cuota.findMany({
    where: { prestamoId: prestamo.id },
    orderBy: { numero: "asc" },
  });

  return NextResponse.json({ ...prestamo, cliente, cuotas });
}

export async function PUT(request: NextRequest, props: { params: Promise<{ prestamoId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { prestamo, forbidden } = await getPrestamoScoped(params.prestamoId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!prestamo) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  // Su deuda ya pasó al préstamo nuevo: reactivarlo permitiría cobrarla dos veces.
  if (prestamo.estado === "REFINANCIADO") {
    return NextResponse.json(
      { error: "No se puede cambiar el estado de un préstamo refinanciado" },
      { status: 409 }
    );
  }

  const body = await request.json();
  const parsed = prestamoUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const actualizado = await auditUpdate(
    "Prestamo",
    user.empresaId,
    user.usuarioId,
    prestamo.id,
    (tx) => tx.prestamo.findUnique({ where: { id: prestamo.id } }),
    (tx) => tx.prestamo.update({ where: { id: prestamo.id }, data: parsed.data })
  );

  return NextResponse.json(actualizado);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ prestamoId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { prestamo, forbidden } = await getPrestamoScoped(params.prestamoId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!prestamo) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });

  const cantidadPagos = await prisma.pago.count({ where: { prestamoId: prestamo.id } });
  if (cantidadPagos > 0) {
    return NextResponse.json(
      { error: "No se puede eliminar un préstamo con pagos registrados" },
      { status: 409 }
    );
  }

  const tieneRefinanciacion = await prisma.refinanciacion.findFirst({
    where: { OR: [{ prestamoAnteriorId: prestamo.id }, { prestamoNuevoId: prestamo.id }] },
  });
  if (tieneRefinanciacion) {
    return NextResponse.json(
      { error: "No se puede eliminar un préstamo vinculado a una refinanciación" },
      { status: 409 }
    );
  }

  await auditDelete(
    "Prestamo",
    user.empresaId,
    user.usuarioId,
    prestamo.id,
    (tx) => tx.prestamo.findUnique({ where: { id: prestamo.id } }),
    async (tx) => {
      await tx.cuota.deleteMany({ where: { prestamoId: prestamo.id } });
      await tx.prestamo.delete({ where: { id: prestamo.id } });
    }
  );

  return NextResponse.json({ success: true });
}
