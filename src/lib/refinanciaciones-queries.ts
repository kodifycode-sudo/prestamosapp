import type { Prisma } from "@prisma/client";
import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { scopeEmpresa } from "@/lib/scope";

/** `db` permite calcularlo dentro de una transacción en curso. */
export async function getSaldoPendiente(prestamoId: string, db: Prisma.TransactionClient = prisma) {
  const cuotas = await db.cuota.findMany({
    where: { prestamoId, estado: { not: "PAGADA" } },
    select: { montoTotal: true, montoPagado: true },
  });
  return cuotas.reduce((sum, c) => sum + (Number(c.montoTotal) - Number(c.montoPagado)), 0);
}

export async function getPrestamosRefinanciables(user: TokenPayload) {
  const prestamos = await prisma.prestamo.findMany({
    where: {
      estado: "ACTIVO",
      ...scopeEmpresa(user),
    },
    include: {
      cliente: { select: { id: true, nombre: true, apellido: true } },
      cuotas: { select: { montoTotal: true, montoPagado: true, estado: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return prestamos
    .map(({ cuotas, ...prestamo }) => {
      const saldoPendiente = cuotas.reduce(
        (sum, c) => (c.estado !== "PAGADA" ? sum + (Number(c.montoTotal) - Number(c.montoPagado)) : sum),
        0
      );
      return { ...prestamo, saldoPendiente };
    })
    .filter((prestamo) => prestamo.saldoPendiente > 0);
}

export async function getRefinanciacionesForUser(user: TokenPayload, q?: string) {
  return prisma.refinanciacion.findMany({
    where: {
      ...scopeEmpresa(user),
      ...(q
        ? {
            prestamoAnterior: {
              cliente: {
                OR: [
                  { nombre: { contains: q, mode: "insensitive" as const } },
                  { apellido: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          }
        : {}),
    },
    include: {
      prestamoAnterior: {
        include: { cliente: { select: { id: true, nombre: true, apellido: true } } },
      },
      prestamoNuevo: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
