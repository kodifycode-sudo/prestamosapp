import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditar } from "@/utils/auditoria";
import { formatMonto } from "@/lib/format";

export const dynamic = "force-dynamic";

const cancelarSchema = z.object({
  // Saldo que vio quien confirma: si cambió (otro cobro entró en el medio), se rechaza
  // en lugar de cobrar un monto distinto del que se mostró.
  montoEsperado: z.coerce.number().positive().transform(Math.round),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO"]).default("EFECTIVO"),
  observacion: z.string().max(500, "La observación admite hasta 500 caracteres").optional(),
});

/** Un pago por cuota pendiente: con muchas cuotas la transacción supera los 5 s por defecto. */
const TX_OPCIONES = { maxWait: 10_000, timeout: 30_000 };

class CancelacionRechazada extends Error {
  constructor(public body: Record<string, unknown>, public status = 409) {
    super(String(body.error));
  }
}

/**
 * Cancelar = el cliente salda todo el préstamo de una vez: se cobra el saldo de cada
 * cuota pendiente y el préstamo queda CANCELADO. A diferencia de anular, lo cobrado
 * cuenta como cobrado y el préstamo sigue sumando al desembolso.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ prestamoId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const prestamo = await prisma.prestamo.findUnique({ where: { id: params.prestamoId } });
  if (!prestamo || prestamo.empresaId !== user.empresaId) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }
  // Igual que cobrar una cuota: el administrador o el cobrador asignado.
  if (user.rol === "COBRADOR" && prestamo.usuarioId !== user.usuarioId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = cancelarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { montoEsperado, metodoPago, observacion } = parsed.data;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Mismo orden de bloqueo que el cobro de cuotas y la refinanciación.
      await tx.$queryRaw`SELECT id FROM "Prestamo" WHERE id = ${prestamo.id} FOR UPDATE`;
      const anterior = await tx.prestamo.findUniqueOrThrow({ where: { id: prestamo.id } });
      if (anterior.estado !== "ACTIVO") {
        throw new CancelacionRechazada({ error: "Solo se puede cancelar un préstamo activo" });
      }

      await tx.$queryRaw`SELECT id FROM "Cuota" WHERE "prestamoId" = ${prestamo.id} FOR UPDATE`;
      const pendientes = await tx.cuota.findMany({
        where: { prestamoId: prestamo.id, estado: { not: "PAGADA" } },
        orderBy: { numero: "asc" },
      });
      const saldo = pendientes.reduce((s, c) => s + Number(c.montoTotal) - Number(c.montoPagado), 0);
      if (saldo <= 0) {
        throw new CancelacionRechazada({ error: "Este préstamo no tiene saldo pendiente" });
      }
      if (Math.round(saldo) !== montoEsperado) {
        throw new CancelacionRechazada({
          error: `El saldo pendiente cambió a ${formatMonto(saldo)}. Revisá el préstamo y volvé a intentar.`,
          code: "SALDO_CAMBIO",
          saldo,
        });
      }

      const nota = observacion?.trim() ? `Cancelación total: ${observacion.trim()}` : "Cancelación total";
      for (const cuota of pendientes) {
        const monto = Number(cuota.montoTotal) - Number(cuota.montoPagado);
        if (monto <= 0) continue;
        const pago = await tx.pago.create({
          data: {
            empresaId: user.empresaId,
            cuotaId: cuota.id,
            prestamoId: prestamo.id,
            usuarioId: user.usuarioId,
            monto,
            metodoPago,
            observacion: nota,
          },
        });
        await auditar("Pago", "CREATE", user.empresaId, user.usuarioId, { registroId: pago.id, newValues: pago }, tx);
        await tx.cuota.update({
          where: { id: cuota.id },
          data: { montoPagado: cuota.montoTotal, estado: "PAGADA" },
        });
      }

      const actualizado = await tx.prestamo.update({ where: { id: prestamo.id }, data: { estado: "CANCELADO" } });
      await auditar(
        "Prestamo",
        "UPDATE",
        user.empresaId,
        user.usuarioId,
        { registroId: prestamo.id, oldValues: anterior, newValues: actualizado },
        tx
      );
      return { prestamo: actualizado, cuotasPagadas: pendientes.length, montoCobrado: saldo };
    }, TX_OPCIONES);

    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof CancelacionRechazada) {
      return NextResponse.json(error.body, { status: error.status });
    }
    throw error;
  }
}
