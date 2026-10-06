import { diasEntre, filtroInstantesEntreDias, hoyCalendario, sumarDias } from "@/lib/fechas";
import { estadoEfectivoPrestamo } from "@/lib/estado-prestamo";
import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { scopeEmpresa as scopeUsuario } from "@/lib/scope";

// ---------- Cartera ----------

export type ReporteCartera = {
  totalDesembolsado: number;
  totalCobrado: number;
  carteraPendiente: number;
  capitalPendiente: number;
  interesPendiente: number;
  /** Lo cobrado por cuotas, separado en capital e interés; con lo pendiente arma el total general. */
  cobradoCapital: number;
  cobradoInteres: number;
  porEstado: { estado: string; cantidad: number; monto: number }[];
  porCobrador: { cobrador: string; prestamosActivos: number; carteraPendiente: number }[];
};

/**
 * Reparte lo pagado de una cuota: cubre primero su interés y recién el excedente amortiza
 * capital. Es el mismo criterio para lo cobrado y para lo pendiente, así suman el total.
 */
function repartirPagado(c: { montoCapital: unknown; montoInteres: unknown; montoPagado: unknown }) {
  const interes = Number(c.montoInteres);
  const pagado = Number(c.montoPagado);
  const aInteres = Math.min(interes, pagado);
  const aCapital = Math.min(Number(c.montoCapital), Math.max(0, pagado - interes));
  return { aCapital, aInteres };
}

export async function getReporteCartera(user: TokenPayload): Promise<ReporteCartera> {
  const hoy = hoyCalendario();
  const [prestamos, totalPagos] = await Promise.all([
    prisma.prestamo.findMany({
      where: scopeUsuario(user),
      select: {
        estado: true,
        monto: true,
        usuarioId: true,
        cuotas: {
          select: {
            estado: true,
            montoCapital: true,
            montoInteres: true,
            montoTotal: true,
            montoPagado: true,
            fechaVencimiento: true,
          },
        },
      },
    }),
    prisma.pago.aggregate({
      where: scopeUsuario(user),
      _sum: { monto: true },
    }),
  ]);

  const porEstadoMap = new Map<string, { cantidad: number; monto: number }>();
  const porCobradorMap = new Map<string, { prestamosActivos: number; carteraPendiente: number }>();

  let totalDesembolsado = 0;
  let carteraPendiente = 0;
  let capitalPendiente = 0;
  let cobradoCapital = 0;
  let cobradoInteres = 0;

  for (const prestamo of prestamos) {
    const monto = Number(prestamo.monto);

    // Agrupado por estado efectivo: los ACTIVO con cuotas vencidas figuran como ATRASADO.
    const estado = estadoEfectivoPrestamo(prestamo.estado, prestamo.cuotas, hoy);
    const estadoActual = porEstadoMap.get(estado) ?? { cantidad: 0, monto: 0 };
    estadoActual.cantidad += 1;
    estadoActual.monto += monto;
    porEstadoMap.set(estado, estadoActual);

    // Un préstamo anulado fue mal cargado y nunca se entregó: figura en "por estado" pero no
    // suma al desembolso ni a lo cobrado. Uno cancelado sí: se entregó y se cobró entero.
    if (prestamo.estado === "ANULADO") continue;
    totalDesembolsado += monto;

    for (const c of prestamo.cuotas) {
      const { aCapital, aInteres } = repartirPagado(c);
      cobradoCapital += aCapital;
      cobradoInteres += aInteres;
    }

    if (prestamo.estado === "ACTIVO") {
      let pendiente = 0;
      for (const c of prestamo.cuotas) {
        if (c.estado === "PAGADA") continue;
        pendiente += Number(c.montoTotal) - Number(c.montoPagado);
        capitalPendiente += Number(c.montoCapital) - repartirPagado(c).aCapital;
      }
      carteraPendiente += pendiente;

      const cobradorActual = porCobradorMap.get(prestamo.usuarioId) ?? {
        prestamosActivos: 0,
        carteraPendiente: 0,
      };
      cobradorActual.prestamosActivos += 1;
      cobradorActual.carteraPendiente += pendiente;
      porCobradorMap.set(prestamo.usuarioId, cobradorActual);
    }
  }

  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: Array.from(porCobradorMap.keys()) }, empresaId: user.empresaId },
    select: { id: true, nombre: true },
  });
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre]));

  return {
    totalDesembolsado,
    totalCobrado: Number(totalPagos._sum.monto ?? 0),
    carteraPendiente,
    capitalPendiente,
    // La cartera pendiente es capital + interés: lo que no es capital es interés por cobrar.
    interesPendiente: carteraPendiente - capitalPendiente,
    cobradoCapital,
    cobradoInteres,
    porEstado: Array.from(porEstadoMap.entries()).map(([estado, v]) => ({ estado, ...v })),
    porCobrador: Array.from(porCobradorMap.entries())
      .map(([usuarioId, v]) => ({ cobrador: nombrePorId.get(usuarioId) ?? "—", ...v }))
      .sort((a, b) => b.carteraPendiente - a.carteraPendiente),
  };
}

// ---------- Por categoría (fuente de ingreso) ----------

export type ReporteCategoria = {
  fuenteIngresoId: string | null;
  nombre: string;
  cantidadPrestamos: number;
  capitalPrestado: number;
  interesGenerado: number;
  totalCobrado: number;
  carteraPendiente: number;
  rendimiento: number;
};

export type ReporteCategorias = {
  totalCapitalPrestado: number;
  totalInteresGenerado: number;
  categorias: ReporteCategoria[];
};

const SIN_CATEGORIA_KEY = "SIN_CATEGORIA";

export async function getReporteCategorias(user: TokenPayload): Promise<ReporteCategorias> {
  // Los anulados no se entregaron: no suman capital prestado, interés ni cantidad.
  const prestamos = await prisma.prestamo.findMany({
    where: { ...scopeUsuario(user), estado: { not: "ANULADO" } },
    select: {
      fuenteIngresoId: true,
      estado: true,
      monto: true,
      cuotas: { select: { estado: true, montoInteres: true, montoTotal: true, montoPagado: true } },
    },
  });

  const porCategoriaMap = new Map<
    string,
    {
      cantidadPrestamos: number;
      capitalPrestado: number;
      interesGenerado: number;
      totalCobrado: number;
      carteraPendiente: number;
    }
  >();

  for (const prestamo of prestamos) {
    const key = prestamo.fuenteIngresoId ?? SIN_CATEGORIA_KEY;
    const actual = porCategoriaMap.get(key) ?? {
      cantidadPrestamos: 0,
      capitalPrestado: 0,
      interesGenerado: 0,
      totalCobrado: 0,
      carteraPendiente: 0,
    };
    actual.cantidadPrestamos += 1;
    actual.capitalPrestado += Number(prestamo.monto);

    for (const cuota of prestamo.cuotas) {
      actual.interesGenerado += Number(cuota.montoInteres);
      actual.totalCobrado += Number(cuota.montoPagado);
      if (prestamo.estado === "ACTIVO" && cuota.estado !== "PAGADA") {
        actual.carteraPendiente += Number(cuota.montoTotal) - Number(cuota.montoPagado);
      }
    }

    porCategoriaMap.set(key, actual);
  }

  const fuenteIds = Array.from(porCategoriaMap.keys()).filter((k) => k !== SIN_CATEGORIA_KEY);
  const fuentes = await prisma.fuenteIngreso.findMany({
    where: { id: { in: fuenteIds }, empresaId: user.empresaId },
    select: { id: true, nombre: true },
  });
  const nombrePorId = new Map(fuentes.map((f) => [f.id, f.nombre]));

  const categorias = Array.from(porCategoriaMap.entries())
    .map(([key, v]) => ({
      fuenteIngresoId: key === SIN_CATEGORIA_KEY ? null : key,
      nombre: key === SIN_CATEGORIA_KEY ? "Sin categorizar" : (nombrePorId.get(key) ?? "—"),
      ...v,
      rendimiento: v.capitalPrestado > 0 ? (v.interesGenerado / v.capitalPrestado) * 100 : 0,
    }))
    .sort((a, b) => b.capitalPrestado - a.capitalPrestado);

  return {
    totalCapitalPrestado: categorias.reduce((sum, c) => sum + c.capitalPrestado, 0),
    totalInteresGenerado: categorias.reduce((sum, c) => sum + c.interesGenerado, 0),
    categorias,
  };
}

// ---------- Cobros por cobrador ----------

export type ReporteCobrosPorCobrador = {
  desde: string | null;
  hasta: string | null;
  totalCobrado: number;
  filas: {
    usuarioId: string;
    cobrador: string;
    cantidadPagos: number;
    totalCobrado: number;
    efectivo: number;
    transferencia: number;
    otro: number;
  }[];
};

export async function getReporteCobrosPorCobrador(
  user: TokenPayload,
  desde?: string,
  hasta?: string
): Promise<ReporteCobrosPorCobrador> {
  const rangoFechaPago = filtroInstantesEntreDias(desde, hasta);
  const pagos = await prisma.pago.findMany({
    where: {
      ...scopeUsuario(user),
      ...(rangoFechaPago ? { fechaPago: rangoFechaPago } : {}),
    },
    select: { usuarioId: true, monto: true, metodoPago: true },
  });

  const porUsuarioMap = new Map<
    string,
    { cantidadPagos: number; totalCobrado: number; efectivo: number; transferencia: number; otro: number }
  >();

  for (const pago of pagos) {
    const actual = porUsuarioMap.get(pago.usuarioId) ?? {
      cantidadPagos: 0,
      totalCobrado: 0,
      efectivo: 0,
      transferencia: 0,
      otro: 0,
    };
    actual.cantidadPagos += 1;
    actual.totalCobrado += Number(pago.monto);
    if (pago.metodoPago === "EFECTIVO") actual.efectivo += Number(pago.monto);
    else if (pago.metodoPago === "TRANSFERENCIA") actual.transferencia += Number(pago.monto);
    else actual.otro += Number(pago.monto);
    porUsuarioMap.set(pago.usuarioId, actual);
  }

  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: Array.from(porUsuarioMap.keys()) }, empresaId: user.empresaId },
    select: { id: true, nombre: true },
  });
  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre]));

  const filas = Array.from(porUsuarioMap.entries())
    .map(([usuarioId, v]) => ({ usuarioId, cobrador: nombrePorId.get(usuarioId) ?? "—", ...v }))
    .sort((a, b) => b.totalCobrado - a.totalCobrado);

  return {
    desde: desde ?? null,
    hasta: hasta ?? null,
    totalCobrado: filas.reduce((sum, f) => sum + f.totalCobrado, 0),
    filas,
  };
}

// ---------- Morosidad ----------

export type ClienteMoroso = {
  clienteId: string;
  clienteNombre: string;
  cobrador: string;
  cantidadCuotasAtrasadas: number;
  montoAtrasado: number;
  diasMaxAtraso: number;
};

export type ReporteMorosidad = {
  totalAtrasado: number;
  cantidadCuotasAtrasadas: number;
  buckets: { rango: string; cantidad: number; monto: number }[];
  clientes: ClienteMoroso[];
};

export async function getReporteMorosidad(user: TokenPayload): Promise<ReporteMorosidad> {
  const hoy = hoyCalendario();

  const cuotas = await prisma.cuota.findMany({
    where: {
      estado: { not: "PAGADA" },
      fechaVencimiento: { lt: hoy },
      prestamo: { estado: "ACTIVO", ...scopeUsuario(user) },
    },
    include: {
      prestamo: {
        include: {
          cliente: { select: { id: true, nombre: true, apellido: true } },
          usuario: { select: { nombre: true } },
        },
      },
    },
  });

  const rangos = [
    { rango: "1-15 días", min: 1, max: 15 },
    { rango: "16-30 días", min: 16, max: 30 },
    { rango: "31-60 días", min: 31, max: 60 },
    { rango: "61+ días", min: 61, max: Infinity },
  ];
  const buckets = rangos.map((r) => ({ rango: r.rango, cantidad: 0, monto: 0 }));

  const porClienteMap = new Map<string, ClienteMoroso>();
  let totalAtrasado = 0;

  for (const cuota of cuotas) {
    const diasAtraso = diasEntre(cuota.fechaVencimiento, hoy);
    const montoAtrasado = Number(cuota.montoTotal) - Number(cuota.montoPagado);
    totalAtrasado += montoAtrasado;

    const bucketIndex = rangos.findIndex((r) => diasAtraso >= r.min && diasAtraso <= r.max);
    if (bucketIndex >= 0) {
      buckets[bucketIndex].cantidad += 1;
      buckets[bucketIndex].monto += montoAtrasado;
    }

    const clienteId = cuota.prestamo.cliente.id;
    const actual = porClienteMap.get(clienteId) ?? {
      clienteId,
      clienteNombre: `${cuota.prestamo.cliente.nombre} ${cuota.prestamo.cliente.apellido}`,
      cobrador: cuota.prestamo.usuario.nombre,
      cantidadCuotasAtrasadas: 0,
      montoAtrasado: 0,
      diasMaxAtraso: 0,
    };
    actual.cantidadCuotasAtrasadas += 1;
    actual.montoAtrasado += montoAtrasado;
    actual.diasMaxAtraso = Math.max(actual.diasMaxAtraso, diasAtraso);
    porClienteMap.set(clienteId, actual);
  }

  return {
    totalAtrasado,
    cantidadCuotasAtrasadas: cuotas.length,
    buckets,
    clientes: Array.from(porClienteMap.values()).sort((a, b) => b.montoAtrasado - a.montoAtrasado),
  };
}

// ---------- Próximos vencimientos ----------

export type ReporteProximosVencimientos = {
  dias: number;
  totalAVencer: number;
  cuotas: {
    cuotaId: string;
    prestamoId: string;
    numero: number;
    clienteNombre: string;
    cobrador: string;
    fechaVencimiento: Date;
    monto: number;
  }[];
};

export async function getReporteProximosVencimientos(
  user: TokenPayload,
  dias = 15
): Promise<ReporteProximosVencimientos> {
  const hoy = hoyCalendario();
  const limite = sumarDias(hoy, dias);

  const cuotas = await prisma.cuota.findMany({
    where: {
      estado: { not: "PAGADA" },
      fechaVencimiento: { gte: hoy, lte: limite },
      prestamo: { estado: "ACTIVO", ...scopeUsuario(user) },
    },
    include: {
      prestamo: {
        include: {
          cliente: { select: { nombre: true, apellido: true } },
          usuario: { select: { nombre: true } },
        },
      },
    },
    orderBy: { fechaVencimiento: "asc" },
  });

  const filas = cuotas.map((cuota) => ({
    cuotaId: cuota.id,
    prestamoId: cuota.prestamoId,
    numero: cuota.numero,
    clienteNombre: `${cuota.prestamo.cliente.nombre} ${cuota.prestamo.cliente.apellido}`,
    cobrador: cuota.prestamo.usuario.nombre,
    fechaVencimiento: cuota.fechaVencimiento,
    monto: Number(cuota.montoTotal) - Number(cuota.montoPagado),
  }));

  return {
    dias,
    totalAVencer: filas.reduce((sum, f) => sum + f.monto, 0),
    cuotas: filas,
  };
}
