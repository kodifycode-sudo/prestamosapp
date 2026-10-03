import { filtroInstantesEntreDias } from "@/lib/fechas";
import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { toCountMap } from "@/lib/facets";
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

export async function getPagosForUser(
  user: TokenPayload,
  filters: PagosFilters = {},
  { limite = PAGOS_POR_PAGINA }: { limite?: number | null } = {}
) {
  const rangoFechaPago = filtroInstantesEntreDias(filters.desde, filters.hasta);
  return prisma.pago.findMany({
    where: {
      ...scopeEmpresa(user),
      ...(filters.metodoPago?.length ? { metodoPago: { in: filters.metodoPago as never[] } } : {}),
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
    },
    include: {
      prestamo: { include: { cliente: { select: { id: true, nombre: true, apellido: true } } } },
      cuota: { select: { numero: true } },
    },
    orderBy: { fechaPago: "desc" },
    ...(limite ? { take: limite } : {}),
  });
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
