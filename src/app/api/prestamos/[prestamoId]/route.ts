import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@/libs/prisma";
import { getUserFromToken, type TokenPayload } from "@/utils/getUserFromToken";
import { auditDelete, auditUpdate } from "@/utils/auditoria";

export const dynamic = "force-dynamic";

const prestamoUpdateSchema = z.object({
  // ATRASADO no se asigna a mano: se calcula según las cuotas vencidas (lib/estado-prestamo).
  // CANCELADO tampoco: lo asigna el cobro del saldo total (/api/prestamos/[id]/cancelar).
  estado: z.enum(["ACTIVO", "PAGADO", "ANULADO"]),
});

/** Rechazo de negocio detectado dentro de la transacción; se traduce a una respuesta HTTP. */
class OperacionRechazada extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}

/** Bloquea el préstamo para que un cobro simultáneo no se cuele entre la validación y el cambio. */
async function bloquearPrestamo(tx: Prisma.TransactionClient, prestamoId: string) {
  await tx.$queryRaw`SELECT id FROM "Prestamo" WHERE id = ${prestamoId} FOR UPDATE`;
}

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
  // Cambiar el estado a mano (anular, dar por pagado, reactivar) es decisión del administrador.
  if (user.rol !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { prestamo } = await getPrestamoScoped(params.prestamoId, user);
  if (!prestamo) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = prestamoUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { estado } = parsed.data;

  try {
    const actualizado = await auditUpdate(
      "Prestamo",
      user.empresaId,
      user.usuarioId,
      prestamo.id,
      async (tx) => {
        await bloquearPrestamo(tx, prestamo.id);
        return tx.prestamo.findUnique({ where: { id: prestamo.id } });
      },
      async (tx) => {
        const actual = await tx.prestamo.findUniqueOrThrow({ where: { id: prestamo.id } });
        // Su deuda ya pasó al préstamo nuevo: reactivarlo permitiría cobrarla dos veces.
        if (actual.estado === "REFINANCIADO") {
          throw new OperacionRechazada("No se puede cambiar el estado de un préstamo refinanciado");
        }
        // Anulado y cancelado son finales: reactivarlos volvería a sumarlos a la cartera.
        if (actual.estado === "ANULADO" || actual.estado === "CANCELADO") {
          throw new OperacionRechazada("No se puede cambiar el estado de un préstamo anulado o cancelado");
        }
        // Anular es dar de baja un préstamo mal cargado: no puede haber cobrado nada.
        if (estado === "ANULADO" && (await tx.pago.count({ where: { prestamoId: prestamo.id } })) > 0) {
          throw new OperacionRechazada("No se puede anular un préstamo con pagos registrados");
        }
        // PAGADO lo asigna el cobro de la última cuota; a mano solo se acepta si ya no queda deuda.
        if (
          estado === "PAGADO" &&
          (await tx.cuota.count({ where: { prestamoId: prestamo.id, estado: { not: "PAGADA" } } })) > 0
        ) {
          throw new OperacionRechazada("No se puede marcar como pagado un préstamo con cuotas pendientes");
        }
        return tx.prestamo.update({ where: { id: prestamo.id }, data: { estado } });
      }
    );
    return NextResponse.json(actualizado);
  } catch (error) {
    if (error instanceof OperacionRechazada) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ prestamoId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (user.rol !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { prestamo } = await getPrestamoScoped(params.prestamoId, user);
  if (!prestamo) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });

  try {
    await auditDelete(
      "Prestamo",
      user.empresaId,
      user.usuarioId,
      prestamo.id,
      async (tx) => {
        await bloquearPrestamo(tx, prestamo.id);
        return tx.prestamo.findUnique({ where: { id: prestamo.id } });
      },
      async (tx) => {
        // Validado con el préstamo bloqueado: un pago no puede entrar entre el conteo y el borrado
        // (no hay claves foráneas en la base que lo impidan).
        if ((await tx.pago.count({ where: { prestamoId: prestamo.id } })) > 0) {
          throw new OperacionRechazada("No se puede eliminar un préstamo con pagos registrados");
        }
        const tieneRefinanciacion = await tx.refinanciacion.findFirst({
          where: { OR: [{ prestamoAnteriorId: prestamo.id }, { prestamoNuevoId: prestamo.id }] },
        });
        if (tieneRefinanciacion) {
          throw new OperacionRechazada("No se puede eliminar un préstamo vinculado a una refinanciación");
        }
        await tx.cuota.deleteMany({ where: { prestamoId: prestamo.id } });
        await tx.prestamo.delete({ where: { id: prestamo.id } });
      }
    );
  } catch (error) {
    if (error instanceof OperacionRechazada) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}
