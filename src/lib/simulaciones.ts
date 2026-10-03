import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { Frecuencia, TipoInteres } from "@prisma/client";
import { toCountMap, valoresDeEnum } from "@/lib/facets";
import { scopeEmpresa } from "@/lib/scope";

export type SimulacionesFilters = {
  tipoInteres?: string[];
  frecuencia?: string[];
  q?: string;
};

export async function getSimulacionesForUser(user: TokenPayload, filters: SimulacionesFilters = {}) {
  const tipos = valoresDeEnum(filters.tipoInteres, TipoInteres);
  const frecuencias = valoresDeEnum(filters.frecuencia, Frecuencia);
  return prisma.simulacion.findMany({
    where: {
      ...scopeEmpresa(user),
      ...(tipos.length ? { tipoInteres: { in: tipos } } : {}),
      ...(frecuencias.length ? { frecuencia: { in: frecuencias } } : {}),
      ...(filters.q ? { clienteNombre: { contains: filters.q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSimulacionesFacetCounts(user: TokenPayload) {
  const scope = scopeEmpresa(user);

  const porTipo = await prisma.simulacion.groupBy({
    by: ["tipoInteres"],
    where: scope,
    _count: { _all: true },
  });
  const porFrecuencia = await prisma.simulacion.groupBy({
    by: ["frecuencia"],
    where: scope,
    _count: { _all: true },
  });

  return {
    tipoInteres: toCountMap(porTipo.map((r) => ({ value: r.tipoInteres ?? "INTERES_FIJO", count: r._count._all }))),
    frecuencia: toCountMap(porFrecuencia.map((r) => ({ value: r.frecuencia, count: r._count._all }))),
  };
}
