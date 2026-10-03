import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { toCountMap } from "@/lib/facets";
import { scopeEmpresa } from "@/lib/scope";
import { hoyCalendario } from "@/lib/fechas";
import { cuotaVencidaImpaga, estadoEfectivoPrestamo, whereEstadoEfectivo } from "@/lib/estado-prestamo";

export type PrestamosFilters = {
  estado?: string[];
  tipoInteres?: string[];
  frecuencia?: string[];
  clienteId?: string;
  q?: string;
};

export async function getPrestamosForUser(user: TokenPayload, filters: PrestamosFilters = {}) {
  const hoy = hoyCalendario();
  const prestamos = await prisma.prestamo.findMany({
    where: {
      ...scopeEmpresa(user),
      ...(filters.estado?.length ? whereEstadoEfectivo(filters.estado, hoy) : {}),
      ...(filters.tipoInteres?.length ? { tipoInteres: { in: filters.tipoInteres as never[] } } : {}),
      ...(filters.frecuencia?.length ? { frecuencia: { in: filters.frecuencia as never[] } } : {}),
      ...(filters.clienteId ? { clienteId: filters.clienteId } : {}),
      ...(filters.q
        ? {
            cliente: {
              OR: [
                { nombre: { contains: filters.q, mode: "insensitive" as const } },
                { apellido: { contains: filters.q, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    },
    include: {
      cliente: { select: { id: true, nombre: true, apellido: true } },
      fuenteIngreso: { select: { id: true, nombre: true } },
      cuotas: { select: { montoTotal: true, montoPagado: true, estado: true, fechaVencimiento: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // total = capital + interés (suma de montoTotal de las cuotas); saldo = lo que aún
  // resta cobrar (cuotas no PAGADAS). Se strippean las cuotas para no engordar el payload.
  return prestamos.map(({ cuotas, ...prestamo }) => {
    const totalAPagar = cuotas.reduce((sum, c) => sum + Number(c.montoTotal), 0);
    const saldoPendiente = cuotas.reduce(
      (sum, c) => (c.estado !== "PAGADA" ? sum + (Number(c.montoTotal) - Number(c.montoPagado)) : sum),
      0
    );
    const cuotasPagadas = cuotas.filter((c) => c.estado === "PAGADA").length;
    const cuotasPendientes = cuotas.length - cuotasPagadas;
    const estadoEfectivo = estadoEfectivoPrestamo(prestamo.estado, cuotas, hoy);
    return { ...prestamo, estadoEfectivo, totalAPagar, saldoPendiente, cuotasPagadas, cuotasPendientes };
  });
}

export async function getPrestamosFacetCounts(user: TokenPayload) {
  const scope = scopeEmpresa(user);

  const porEstado = await prisma.prestamo.groupBy({
    by: ["estado"],
    where: scope,
    _count: { _all: true },
  });
  const porTipo = await prisma.prestamo.groupBy({
    by: ["tipoInteres"],
    where: scope,
    _count: { _all: true },
  });
  const porFrecuencia = await prisma.prestamo.groupBy({
    by: ["frecuencia"],
    where: scope,
    _count: { _all: true },
  });

  // Los ACTIVO con cuotas vencidas cuentan como ATRASADO (estado calculado, ver lib/estado-prestamo).
  const activosAtrasados = await prisma.prestamo.count({
    where: { ...scope, estado: "ACTIVO", cuotas: { some: cuotaVencidaImpaga() } },
  });
  const conteoEstado = porEstado.map((r) => ({ value: r.estado as string, count: r._count._all }));
  const activos = conteoEstado.find((r) => r.value === "ACTIVO");
  if (activos) activos.count -= activosAtrasados;
  const atrasados = conteoEstado.find((r) => r.value === "ATRASADO");
  if (atrasados) atrasados.count += activosAtrasados;
  else if (activosAtrasados) conteoEstado.push({ value: "ATRASADO", count: activosAtrasados });

  return {
    estado: toCountMap(conteoEstado),
    tipoInteres: toCountMap(porTipo.map((r) => ({ value: r.tipoInteres ?? "INTERES_FIJO", count: r._count._all }))),
    frecuencia: toCountMap(porFrecuencia.map((r) => ({ value: r.frecuencia, count: r._count._all }))),
  };
}
