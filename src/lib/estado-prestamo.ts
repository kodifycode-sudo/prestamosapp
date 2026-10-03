import type { Prisma } from "@prisma/client";
import { hoyCalendario } from "@/lib/fechas";

/**
 * "Atrasado" no se guarda en la base: un préstamo ACTIVO con alguna cuota vencida
 * e impaga se muestra y filtra como ATRASADO, pero sigue ACTIVO para todo lo demás
 * (cobros, refinanciación, cartera y morosidad trabajan sobre préstamos ACTIVO).
 * Es el mismo criterio que usan las cuotas (ver lib/cuotas).
 */

/** Cuota vencida antes de hoy y no pagada. */
export function cuotaVencidaImpaga(hoy: Date = hoyCalendario()): Prisma.CuotaWhereInput {
  return { estado: { not: "PAGADA" }, fechaVencimiento: { lt: hoy } };
}

export function estadoEfectivoPrestamo(
  estado: string,
  cuotas: { estado: string; fechaVencimiento: Date | string }[],
  hoy: Date = hoyCalendario()
): string {
  if (estado !== "ACTIVO") return estado;
  const atrasado = cuotas.some((c) => c.estado !== "PAGADA" && new Date(c.fechaVencimiento) < hoy);
  return atrasado ? "ATRASADO" : "ACTIVO";
}

/** Condición para filtrar préstamos por estado efectivo (ACTIVO y ATRASADO calculados). */
export function whereEstadoEfectivo(estados: string[], hoy: Date = hoyCalendario()): Prisma.PrestamoWhereInput {
  const condiciones: Prisma.PrestamoWhereInput[] = [];
  // ATRASADO también incluye préstamos que hayan quedado guardados así antes de este cambio.
  const guardados = estados.filter((e) => e !== "ACTIVO");
  if (guardados.length) condiciones.push({ estado: { in: guardados as never[] } });
  if (estados.includes("ATRASADO")) {
    condiciones.push({ estado: "ACTIVO", cuotas: { some: cuotaVencidaImpaga(hoy) } });
  }
  if (estados.includes("ACTIVO")) {
    condiciones.push({ estado: "ACTIVO", cuotas: { none: cuotaVencidaImpaga(hoy) } });
  }
  return { OR: condiciones };
}
