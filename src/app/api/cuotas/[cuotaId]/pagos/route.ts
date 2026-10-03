import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditCreate } from "@/utils/auditoria";
import { formatMonto } from "@/lib/format";

export const dynamic = "force-dynamic";

const pagoSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a 0").transform(Math.round),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO"]).default("EFECTIVO"),
  observacion: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * Los cobros de un mismo préstamo se serializan por el bloqueo: el que llega
 * después espera a que termine el anterior en vez de fallar con el timeout
 * de 5 s que Prisma usa por defecto.
 */
const TX_OPCIONES = { maxWait: 10_000, timeout: 20_000 };

/** Rechazo de negocio detectado dentro de la transacción; se traduce a una respuesta HTTP. */
class PagoRechazado extends Error {
  constructor(public body: Record<string, unknown>, public status: number) {
    super(String(body.error));
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { cuotaId: string } }
) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const cuota = await prisma.cuota.findUnique({ where: { id: params.cuotaId } });
  if (!cuota) return NextResponse.json({ error: "Cuota no encontrada" }, { status: 404 });

  const prestamo = await prisma.prestamo.findUnique({ where: { id: cuota.prestamoId } });
  if (!prestamo || prestamo.empresaId !== user.empresaId) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }
  if (user.rol === "COBRADOR" && prestamo.usuarioId !== user.usuarioId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const buscarPorIdempotencia = (idempotencyKey: string) =>
    prisma.pago.findUnique({
      where: { empresaId_idempotencyKey: { empresaId: user.empresaId, idempotencyKey } },
    });

  if (parsed.data.idempotencyKey) {
    const existente = await buscarPorIdempotencia(parsed.data.idempotencyKey);
    if (existente) return NextResponse.json(existente, { status: 200 });
  }

  try {
    const pago = await auditCreate("Pago", user.empresaId, user.usuarioId, async (tx) => {
      // Bloqueo préstamo y cuota (siempre en ese orden, igual que la refinanciación)
      // para que dos cobros simultáneos no se pisen y el saldo se valide con el
      // valor vigente, no con el leído antes de la transacción.
      await tx.$queryRaw`SELECT id FROM "Prestamo" WHERE id = ${prestamo.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Cuota" WHERE id = ${cuota.id} FOR UPDATE`;

      const prestamoActual = await tx.prestamo.findUniqueOrThrow({ where: { id: prestamo.id } });
      const cuotaActual = await tx.cuota.findUniqueOrThrow({ where: { id: cuota.id } });

      if (prestamoActual.estado === "CANCELADO" || prestamoActual.estado === "REFINANCIADO") {
        throw new PagoRechazado(
          { error: "No se pueden registrar pagos en un préstamo cancelado o refinanciado" },
          409
        );
      }

      const pendiente = Number(cuotaActual.montoTotal) - Number(cuotaActual.montoPagado);
      if (parsed.data.monto > pendiente) {
        throw new PagoRechazado(
          {
            error: `El monto supera el saldo pendiente de la cuota (${formatMonto(pendiente)})`,
            code: "MONTO_EXCEDE_PENDIENTE",
            pendiente,
          },
          400
        );
      }

      const nuevoPago = await tx.pago.create({
        data: {
          empresaId: user.empresaId,
          cuotaId: cuota.id,
          prestamoId: prestamo.id,
          usuarioId: user.usuarioId,
          monto: parsed.data.monto,
          metodoPago: parsed.data.metodoPago,
          observacion: parsed.data.observacion,
          idempotencyKey: parsed.data.idempotencyKey,
        },
      });

      const nuevoMontoPagado = Number(cuotaActual.montoPagado) + parsed.data.monto;
      const nuevoEstadoCuota =
        nuevoMontoPagado >= Number(cuotaActual.montoTotal)
          ? "PAGADA"
          : nuevoMontoPagado > 0
            ? "PARCIAL"
            : "PENDIENTE";

      await tx.cuota.update({
        where: { id: cuota.id },
        data: { montoPagado: nuevoMontoPagado, estado: nuevoEstadoCuota },
      });

      const cuotasDelPrestamo = await tx.cuota.findMany({
        where: { prestamoId: prestamo.id },
        select: { id: true, estado: true },
      });
      const todasPagadas = cuotasDelPrestamo.every((c) =>
        c.id === cuota.id ? nuevoEstadoCuota === "PAGADA" : c.estado === "PAGADA"
      );
      if (todasPagadas) {
        await tx.prestamo.update({
          where: { id: prestamo.id },
          data: { estado: "PAGADO" },
        });
      }

      return nuevoPago;
    }, TX_OPCIONES);

    return NextResponse.json(pago, { status: 201 });
  } catch (error) {
    if (error instanceof PagoRechazado) {
      return NextResponse.json(error.body, { status: error.status });
    }
    // Dos envíos simultáneos con la misma idempotencyKey: el segundo choca con el
    // índice único; devolvemos el pago que registró el primero.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      parsed.data.idempotencyKey
    ) {
      const existente = await buscarPorIdempotencia(parsed.data.idempotencyKey);
      if (existente) return NextResponse.json(existente, { status: 200 });
    }
    throw error;
  }
}
