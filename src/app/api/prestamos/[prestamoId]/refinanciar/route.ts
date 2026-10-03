import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CUOTAS_MAXIMAS, MENSAJE_CUOTAS_MAXIMAS, MENSAJE_MONTO_MAXIMO, MONTO_MAXIMO } from "@/lib/limites";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditar } from "@/utils/auditoria";
import { generarCuotas } from "@/lib/prestamos";
import { getSaldoPendiente } from "@/lib/refinanciaciones-queries";

export const dynamic = "force-dynamic";

const refinanciarSchema = z.object({
  interes: z.coerce.number().min(0, "El interés no puede ser negativo").max(MONTO_MAXIMO, MENSAJE_MONTO_MAXIMO).transform(Math.round),
  cantidadCuotas: z.coerce.number().int().min(1, "Debe haber al menos 1 cuota").max(CUOTAS_MAXIMAS, MENSAJE_CUOTAS_MAXIMAS),
  frecuencia: z.enum(["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"]),
  fechaInicio: z.coerce.date(),
  montoAdicional: z.coerce.number().min(0, "No puede ser negativo").max(MONTO_MAXIMO, MENSAJE_MONTO_MAXIMO).transform(Math.round).default(0),
  observacion: z.string().optional(),
});

/** Rechazo de negocio detectado dentro de la transacción. */
class RefinanciacionRechazada extends Error {}

export async function POST(
  request: NextRequest,
  { params }: { params: { prestamoId: string } }
) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const prestamoAnterior = await prisma.prestamo.findUnique({ where: { id: params.prestamoId } });
  if (!prestamoAnterior || prestamoAnterior.empresaId !== user.empresaId) {
    return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });
  }
  if (user.rol === "COBRADOR" && prestamoAnterior.usuarioId !== user.usuarioId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (prestamoAnterior.estado !== "ACTIVO") {
    return NextResponse.json(
      { error: "Solo se puede refinanciar un préstamo activo" },
      { status: 409 }
    );
  }

  const body = await request.json();
  const parsed = refinanciarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      // Bloqueo el préstamo y revalido estado y saldo con los valores vigentes:
      // así dos refinanciaciones simultáneas (o un pago en curso) no pueden
      // generar dos préstamos nuevos ni partir de un saldo desactualizado.
      await tx.$queryRaw`SELECT id FROM "Prestamo" WHERE id = ${prestamoAnterior.id} FOR UPDATE`;
      const actual = await tx.prestamo.findUniqueOrThrow({ where: { id: prestamoAnterior.id } });
      if (actual.estado !== "ACTIVO") {
        throw new RefinanciacionRechazada("Solo se puede refinanciar un préstamo activo");
      }

      const saldoPendiente = await getSaldoPendiente(prestamoAnterior.id, tx);
      if (saldoPendiente <= 0) {
        throw new RefinanciacionRechazada("Este préstamo no tiene saldo pendiente para refinanciar");
      }

      const montoNuevo = Math.round(saldoPendiente) + data.montoAdicional;
      if (montoNuevo > MONTO_MAXIMO) {
        throw new RefinanciacionRechazada(`El nuevo monto ${MENSAJE_MONTO_MAXIMO.toLowerCase()}`);
      }

      const cuotasCalculadas = generarCuotas({
        monto: montoNuevo,
        interes: data.interes,
        cantidadCuotas: data.cantidadCuotas,
        frecuencia: data.frecuencia,
        fechaInicio: data.fechaInicio,
      });

      const prestamoNuevo = await tx.prestamo.create({
        data: {
          empresaId: user.empresaId,
          clienteId: prestamoAnterior.clienteId,
          usuarioId: prestamoAnterior.usuarioId,
          fuenteIngresoId: prestamoAnterior.fuenteIngresoId,
          monto: montoNuevo,
          interes: data.interes,
          cantidadCuotas: data.cantidadCuotas,
          frecuencia: data.frecuencia,
          fechaInicio: data.fechaInicio,
        },
      });

      await tx.cuota.createMany({
        data: cuotasCalculadas.map((cuota) => ({
          prestamoId: prestamoNuevo.id,
          numero: cuota.numero,
          fechaVencimiento: cuota.fechaVencimiento,
          montoCapital: cuota.montoCapital,
          montoInteres: cuota.montoInteres,
          montoTotal: cuota.montoTotal,
        })),
      });

      await tx.prestamo.update({
        where: { id: prestamoAnterior.id },
        data: { estado: "REFINANCIADO" },
      });

      const refinanciacion = await tx.refinanciacion.create({
        data: {
          empresaId: user.empresaId,
          prestamoAnteriorId: prestamoAnterior.id,
          prestamoNuevoId: prestamoNuevo.id,
          usuarioId: user.usuarioId,
          saldoAnterior: saldoPendiente,
          montoAdicional: data.montoAdicional,
          observacion: data.observacion,
        },
      });

      return { prestamoNuevo, refinanciacion };
    }, { maxWait: 10_000, timeout: 20_000 });
  } catch (error) {
    if (error instanceof RefinanciacionRechazada) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  await auditar("Refinanciacion", "CREATE", user.empresaId, user.usuarioId, {
    registroId: resultado.refinanciacion.id,
    newValues: {
      ...resultado.refinanciacion,
      prestamoAnteriorId: prestamoAnterior.id,
      prestamoNuevoId: resultado.prestamoNuevo.id,
    },
  });

  return NextResponse.json(resultado.prestamoNuevo, { status: 201 });
}
