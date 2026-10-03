import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CUOTAS_MAXIMAS, MENSAJE_CUOTAS_MAXIMAS, MENSAJE_MONTO_MAXIMO, MONTO_MAXIMO } from "@/lib/limites";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditCreate } from "@/utils/auditoria";
import { generarCuotas } from "@/lib/prestamos";
import { scopeEmpresa } from "@/lib/scope";
import { leerPaginacion } from "@/lib/paginacion";

export const dynamic = "force-dynamic";

const prestamoSchema = z.object({
  clienteId: z.string().min(1, "Seleccioná un cliente"),
  fuenteIngresoId: z.string().optional(),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0").max(MONTO_MAXIMO, MENSAJE_MONTO_MAXIMO).transform(Math.round),
  interes: z.coerce.number().min(0, "El interés no puede ser negativo").max(MONTO_MAXIMO, MENSAJE_MONTO_MAXIMO).transform(Math.round),
  cantidadCuotas: z.coerce.number().int().min(1, "Debe haber al menos 1 cuota").max(CUOTAS_MAXIMAS, MENSAJE_CUOTAS_MAXIMAS),
  frecuencia: z.enum(["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"]),
  fechaInicio: z.coerce.date(),
});

export async function GET(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const clienteId = request.nextUrl.searchParams.get("clienteId") ?? undefined;
  const estado = request.nextUrl.searchParams.get("estado") ?? undefined;

  const pagina = leerPaginacion(request.nextUrl.searchParams);
  const where = {
    ...scopeEmpresa(user),
    ...(clienteId ? { clienteId } : {}),
    ...(estado ? { estado: estado as never } : {}),
  };

  const prestamos = await prisma.prestamo.findMany({
    where,
    ...pagina,
    include: {
      cliente: { select: { id: true, nombre: true, apellido: true } },
      fuenteIngreso: { select: { id: true, nombre: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!pagina.take) return NextResponse.json(prestamos);
  const total = await prisma.prestamo.count({ where });
  return NextResponse.json(prestamos, { headers: { "X-Total-Count": String(total) } });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = prestamoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const cliente = await prisma.cliente.findUnique({ where: { id: data.clienteId } });
  if (!cliente || cliente.empresaId !== user.empresaId) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }
  if (user.rol === "COBRADOR" && cliente.usuarioId !== user.usuarioId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (data.fuenteIngresoId) {
    const fuente = await prisma.fuenteIngreso.findUnique({ where: { id: data.fuenteIngresoId } });
    if (!fuente || fuente.empresaId !== user.empresaId) {
      return NextResponse.json({ error: "Fuente de ingreso no encontrada" }, { status: 404 });
    }
  }

  const cuotasCalculadas = generarCuotas({
    monto: data.monto,
    interes: data.interes,
    cantidadCuotas: data.cantidadCuotas,
    frecuencia: data.frecuencia,
    fechaInicio: data.fechaInicio,
  });

  const prestamo = await auditCreate("Prestamo", user.empresaId, user.usuarioId, async (tx) => {
    const nuevo = await tx.prestamo.create({
      data: {
        empresaId: user.empresaId,
        clienteId: data.clienteId,
        usuarioId: cliente.usuarioId,
        fuenteIngresoId: data.fuenteIngresoId,
        monto: data.monto,
        interes: data.interes,
        cantidadCuotas: data.cantidadCuotas,
        frecuencia: data.frecuencia,
        fechaInicio: data.fechaInicio,
      },
    });

    await tx.cuota.createMany({
      data: cuotasCalculadas.map((cuota) => ({
        prestamoId: nuevo.id,
        numero: cuota.numero,
        fechaVencimiento: cuota.fechaVencimiento,
        montoCapital: cuota.montoCapital,
        montoInteres: cuota.montoInteres,
        montoTotal: cuota.montoTotal,
      })),
    });

    const cuotas = await tx.cuota.findMany({
      where: { prestamoId: nuevo.id },
      orderBy: { numero: "asc" },
    });

    return { ...nuevo, cuotas };
  });

  return NextResponse.json(prestamo, { status: 201 });
}
