import {
  fechaCalendarioDe,
  formatFecha,
  hoyCalendario,
  inicioDelDia,
  inicioMesCalendario,
  inicioMesSiguienteCalendario,
  rangoDeDias,
  sumarDias,
} from "@/lib/fechas";
import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { scopeEmpresa } from "@/lib/scope";

export async function getDashboardStats(user: TokenPayload) {
  const scopePrestamo = scopeEmpresa(user);
  const scopePago = scopeEmpresa(user);

  // "Hoy" y "este mes" en la zona del negocio: los vencimientos se comparan como
  // fechas de calendario y los pagos (instantes) por el rango de horas de esos días.
  const hoy = hoyCalendario();
  const rangoHoy = rangoDeDias(hoy, hoy);
  const rangoMes = {
    gte: inicioDelDia(inicioMesCalendario(hoy)),
    lt: inicioDelDia(inicioMesSiguienteCalendario(hoy)),
  };
  const diaMes = (fecha: Date) => formatFecha(fecha).slice(0, 5);

  // Consultas independientes entre sí: se lanzan en paralelo.
  const [
    prestamosActivos,
    cuotasPendientesActivos,
    pagosHoy,
    pagosMes,
    cuotasAtrasadas,
    proximasCuotas,
    pagosUltimos14Dias,
  ] = await Promise.all([
    prisma.prestamo.count({
      where: { ...scopePrestamo, estado: "ACTIVO" },
    }),
    // Cartera activa = lo que resta cobrar de las cuotas no pagadas, sumado en la base.
    prisma.cuota.aggregate({
      where: {
        estado: { not: "PAGADA" },
        prestamo: { ...scopePrestamo, estado: "ACTIVO" },
      },
      _sum: { montoTotal: true, montoPagado: true },
    }),
    prisma.pago.aggregate({
      where: { ...scopePago, fechaPago: rangoHoy },
      _sum: { monto: true },
    }),
    prisma.pago.aggregate({
      where: { ...scopePago, fechaPago: rangoMes },
      _sum: { monto: true },
    }),
    prisma.cuota.count({
      where: {
        estado: { not: "PAGADA" },
        fechaVencimiento: { lt: hoy },
        prestamo: { ...scopePrestamo, estado: "ACTIVO" },
      },
    }),
    prisma.cuota.findMany({
      where: {
        estado: { not: "PAGADA" },
        fechaVencimiento: { gte: hoy, lte: sumarDias(hoy, 7) },
        prestamo: { ...scopePrestamo, estado: "ACTIVO" },
      },
      include: {
        prestamo: { include: { cliente: { select: { id: true, nombre: true, apellido: true } } } },
      },
      orderBy: { fechaVencimiento: "asc" },
      take: 20,
    }),
    prisma.pago.findMany({
      where: { ...scopePago, fechaPago: rangoDeDias(sumarDias(hoy, -13), hoy) },
      select: { monto: true, fechaPago: true },
    }),
  ]);

  const carteraActiva =
    Number(cuotasPendientesActivos._sum.montoTotal ?? 0) - Number(cuotasPendientesActivos._sum.montoPagado ?? 0);

  const cobrosPorDiaMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    cobrosPorDiaMap.set(diaMes(sumarDias(hoy, -i)), 0);
  }
  for (const pago of pagosUltimos14Dias) {
    const key = diaMes(fechaCalendarioDe(pago.fechaPago));
    cobrosPorDiaMap.set(key, (cobrosPorDiaMap.get(key) ?? 0) + Number(pago.monto));
  }

  return {
    prestamosActivos,
    carteraActiva,
    cobradoHoy: Number(pagosHoy._sum.monto ?? 0),
    cobradoMes: Number(pagosMes._sum.monto ?? 0),
    cuotasAtrasadas,
    proximasCuotas: proximasCuotas.map((c) => ({
      id: c.id,
      numero: c.numero,
      fechaVencimiento: c.fechaVencimiento,
      pendiente: Number(c.montoTotal) - Number(c.montoPagado),
      prestamoId: c.prestamoId,
      cliente: c.prestamo.cliente,
    })),
    cobrosPorDia: Array.from(cobrosPorDiaMap.entries()).map(([fecha, total]) => ({ fecha, total })),
  };
}
