import { MetodoPago, type Prisma } from "@prisma/client";
import { filtroInstantesEntreDias } from "@/lib/fechas";
import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { toCountMap, valoresDeEnum } from "@/lib/facets";
import { scopeEmpresa } from "@/lib/scope";

export type PagosFilters = {
  metodoPago?: string[];
  cobradorId?: string[];
  desde?: string;
  hasta?: string;
  q?: string;
};

/** Cantidad de pagos que muestra la página; la exportación a Excel no tiene tope. */
export const PAGOS_POR_PAGINA = 200;

type ParametrosPagos = { metodo?: string | null; cobrador?: string | null; desde?: string | null; hasta?: string | null; q?: string | null };

const parseList = (value?: string | null) => (value ? value.split(",").filter(Boolean) : []);

/** Filtros de la URL de /pagos (?metodo=&cobrador=&desde=&hasta=&q=). La página y la exportación usan la misma lectura. */
export function parsePagosFilters(params: ParametrosPagos): PagosFilters {
  return {
    metodoPago: parseList(params.metodo),
    cobradorId: parseList(params.cobrador),
    desde: params.desde ?? undefined,
    hasta: params.hasta ?? undefined,
    q: params.q ?? undefined,
  };
}

/** Condición de los filtros de /pagos: la comparten la lista, la exportación y el cierre del día. */
function wherePagos(user: TokenPayload, filters: PagosFilters): Prisma.PagoWhereInput {
  const rangoFechaPago = filtroInstantesEntreDias(filters.desde, filters.hasta);
  const metodos = valoresDeEnum(filters.metodoPago, MetodoPago);
  return {
    ...scopeEmpresa(user),
    ...(metodos.length ? { metodoPago: { in: metodos } } : {}),
    ...(user.rol === "ADMIN" && filters.cobradorId?.length
      ? { usuarioId: { in: filters.cobradorId } }
      : {}),
    ...(rangoFechaPago ? { fechaPago: rangoFechaPago } : {}),
    ...(filters.q
      ? {
          prestamo: {
            cliente: {
              OR: [
                { nombre: { contains: filters.q, mode: "insensitive" as const } },
                { apellido: { contains: filters.q, mode: "insensitive" as const } },
              ],
            },
          },
        }
      : {}),
  };
}

export async function getPagosForUser(
  user: TokenPayload,
  filters: PagosFilters = {},
  { limite = PAGOS_POR_PAGINA }: { limite?: number | null } = {}
) {
  return prisma.pago.findMany({
    where: wherePagos(user, filters),
    include: {
      prestamo: { include: { cliente: { select: { id: true, nombre: true, apellido: true } } } },
      cuota: { select: { numero: true } },
    },
    orderBy: { fechaPago: "desc" },
    ...(limite ? { take: limite } : {}),
  });
}

export type ResumenPagos = {
  total: number;
  cantidad: number;
  porMetodo: Record<"EFECTIVO" | "TRANSFERENCIA" | "OTRO", number>;
};

/** Totales del cierre del día sobre todos los pagos del filtro (no solo los que muestra la página). */
export async function getResumenPagos(user: TokenPayload, filters: PagosFilters = {}): Promise<ResumenPagos> {
  const grupos = await prisma.pago.groupBy({
    by: ["metodoPago"],
    where: wherePagos(user, filters),
    _sum: { monto: true },
    _count: { _all: true },
  });
  const resumen: ResumenPagos = { total: 0, cantidad: 0, porMetodo: { EFECTIVO: 0, TRANSFERENCIA: 0, OTRO: 0 } };
  for (const g of grupos) {
    const monto = Number(g._sum.monto ?? 0);
    resumen.total += monto;
    resumen.cantidad += g._count._all;
    resumen.porMetodo[g.metodoPago] = monto;
  }
  return resumen;
}

export async function getPagosFacetCounts(user: TokenPayload) {
  const scope = scopeEmpresa(user);

  const porMetodo = await prisma.pago.groupBy({
    by: ["metodoPago"],
    where: scope,
    _count: { _all: true },
  });

  const metodoPago = toCountMap(porMetodo.map((r) => ({ value: r.metodoPago, count: r._count._all })));

  if (user.rol !== "ADMIN") {
    return { metodoPago, cobradores: [] as { label: string; value: string; count: number }[] };
  }

  const porCobrador = await prisma.pago.groupBy({
    by: ["usuarioId"],
    where: { empresaId: user.empresaId },
    _count: { _all: true },
  });
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: porCobrador.map((r) => r.usuarioId) }, empresaId: user.empresaId },
    select: { id: true, nombre: true },
  });

  const cobradores = porCobrador.map((r) => ({
    label: usuarios.find((u) => u.id === r.usuarioId)?.nombre ?? "—",
    value: r.usuarioId,
    count: r._count._all,
  }));

  return { metodoPago, cobradores };
}
