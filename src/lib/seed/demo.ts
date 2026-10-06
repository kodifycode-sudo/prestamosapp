import prisma from "@/libs/prisma";
import { hashPassword } from "@/utils/hash";
import { generarCuotas, type Frecuencia } from "@/lib/prestamos";

const ADMIN_EMAIL = "admin@prestamos.local";
const ADMIN_PASSWORD = "admin123";

type MetodoPago = "EFECTIVO" | "TRANSFERENCIA" | "OTRO";
type EstadoPrestamoFinal = "ACTIVO" | "PAGADO" | "CANCELADO" | "ANULADO";

function d(anio: number, mes: number, dia: number) {
  return new Date(anio, mes - 1, dia);
}

function offsetDias(fecha: Date, dias: number) {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function metodoAleatorio(): MetodoPago {
  const opciones: MetodoPago[] = ["EFECTIVO", "EFECTIVO", "TRANSFERENCIA", "OTRO"];
  return opciones[randInt(0, opciones.length - 1)];
}

async function getOrCreateAdmin() {
  const existente = await prisma.usuario.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existente) {
    await prisma.empresa.update({
      where: { id: existente.empresaId },
      data: {
        ruc: "80012345-6",
        telefono: "021-234567",
        direccion: "Asunción, Paraguay",
      },
    });
    return existente;
  }

  const empresa = await prisma.empresa.create({
    data: {
      nombre: "Empresa Demo",
      ruc: "80012345-6",
      telefono: "021-234567",
      direccion: "Asunción, Paraguay",
    },
  });

  return prisma.usuario.create({
    data: {
      empresaId: empresa.id,
      nombre: "Administrador",
      email: ADMIN_EMAIL,
      password: await hashPassword(ADMIN_PASSWORD),
      rol: "ADMIN",
      activo: true,
    },
  });
}

async function limpiarDatosDemo(empresaId: string) {
  await prisma.pago.deleteMany({ where: { empresaId } });
  await prisma.auditoria.deleteMany({ where: { empresaId } });
  await prisma.refinanciacion.deleteMany({ where: { empresaId } });
  await prisma.cuota.deleteMany({ where: { prestamo: { empresaId } } });
  await prisma.prestamo.deleteMany({ where: { empresaId } });
  await prisma.simulacion.deleteMany({ where: { empresaId } });
  await prisma.cliente.deleteMany({ where: { empresaId } });
  await prisma.fuenteIngreso.deleteMany({ where: { empresaId } });
}

async function crearFuentesIngreso(empresaId: string) {
  const [ganado, supermercado, compraVenta] = await Promise.all([
    prisma.fuenteIngreso.create({
      data: {
        empresaId,
        nombre: "Venta de Ganado",
        descripcion: "Capital reinvertido de la venta de ganado",
      },
    }),
    prisma.fuenteIngreso.create({
      data: { empresaId, nombre: "Supermercado", descripcion: "Ingresos del supermercado" },
    }),
    prisma.fuenteIngreso.create({
      data: {
        empresaId,
        nombre: "Compra/Venta",
        descripcion: "Ingresos de compra y venta de mercadería",
      },
    }),
  ]);
  return { ganado, supermercado, compraVenta };
}

async function crearCliente(params: {
  empresaId: string;
  usuarioId: string;
  nombre: string;
  apellido: string;
  documento: string;
  telefono: string;
  direccion?: string;
  email?: string;
}) {
  return prisma.cliente.create({
    data: {
      empresaId: params.empresaId,
      usuarioId: params.usuarioId,
      nombre: params.nombre,
      apellido: params.apellido,
      documento: params.documento,
      telefono: params.telefono,
      direccion: params.direccion,
      email: params.email,
    },
  });
}

/** Todos los préstamos de demo usan interés fijo (capital + monto de interés), el único modo que ofrece la app hoy. */
async function crearPrestamo(params: {
  empresaId: string;
  usuarioId: string;
  clienteId: string;
  fuenteIngresoId?: string;
  monto: number;
  interes: number;
  cantidadCuotas: number;
  frecuencia: Frecuencia;
  fechaInicio: Date;
}) {
  const cuotasCalculadas = generarCuotas({
    monto: params.monto,
    interes: params.interes,
    cantidadCuotas: params.cantidadCuotas,
    frecuencia: params.frecuencia,
    fechaInicio: params.fechaInicio,
  });

  const prestamo = await prisma.prestamo.create({
    data: {
      empresaId: params.empresaId,
      clienteId: params.clienteId,
      usuarioId: params.usuarioId,
      fuenteIngresoId: params.fuenteIngresoId,
      monto: params.monto,
      interes: params.interes,
      cantidadCuotas: params.cantidadCuotas,
      frecuencia: params.frecuencia,
      fechaInicio: params.fechaInicio,
    },
  });

  await prisma.cuota.createMany({
    data: cuotasCalculadas.map((c) => ({
      prestamoId: prestamo.id,
      numero: c.numero,
      fechaVencimiento: c.fechaVencimiento,
      montoCapital: c.montoCapital,
      montoInteres: c.montoInteres,
      montoTotal: c.montoTotal,
    })),
  });

  const cuotas = await prisma.cuota.findMany({
    where: { prestamoId: prestamo.id },
    orderBy: { numero: "asc" },
  });

  return { prestamo, cuotas };
}

async function registrarPago(params: {
  empresaId: string;
  usuarioId: string;
  prestamoId: string;
  cuotaId: string;
  montoTotal: number;
  montoPagadoActual: number;
  monto: number;
  fechaPago: Date;
  metodoPago?: MetodoPago;
  observacion?: string;
}) {
  await prisma.pago.create({
    data: {
      empresaId: params.empresaId,
      cuotaId: params.cuotaId,
      prestamoId: params.prestamoId,
      usuarioId: params.usuarioId,
      monto: params.monto,
      fechaPago: params.fechaPago,
      metodoPago: params.metodoPago ?? metodoAleatorio(),
      observacion: params.observacion,
    },
  });

  const nuevoMontoPagado = params.montoPagadoActual + params.monto;
  const nuevoEstado =
    nuevoMontoPagado >= params.montoTotal ? "PAGADA" : nuevoMontoPagado > 0 ? "PARCIAL" : "PENDIENTE";

  await prisma.cuota.update({
    where: { id: params.cuotaId },
    data: { montoPagado: nuevoMontoPagado, estado: nuevoEstado },
  });
}

/** Paga de forma completa las primeras `cantidad` cuotas (con algo de atraso realista en la fecha de pago). */
async function pagarPrimeras(
  cuotas: { id: string; montoTotal: unknown; fechaVencimiento: Date }[],
  cantidad: number,
  ctx: { empresaId: string; usuarioId: string; prestamoId: string }
) {
  for (let i = 0; i < cantidad && i < cuotas.length; i++) {
    const cuota = cuotas[i];
    const montoTotal = Number(cuota.montoTotal);
    await registrarPago({
      ...ctx,
      cuotaId: cuota.id,
      montoTotal,
      montoPagadoActual: 0,
      monto: montoTotal,
      fechaPago: offsetDias(cuota.fechaVencimiento, randInt(-2, 5)),
    });
  }
}

/** Paga parcialmente (un porcentaje) la cuota en el índice dado. */
async function pagarParcial(
  cuotas: { id: string; montoTotal: unknown; fechaVencimiento: Date }[],
  indice: number,
  porcentaje: number,
  ctx: { empresaId: string; usuarioId: string; prestamoId: string }
) {
  const cuota = cuotas[indice];
  if (!cuota) return;
  const montoTotal = Number(cuota.montoTotal);
  const monto = Math.round(montoTotal * porcentaje);
  await registrarPago({
    ...ctx,
    cuotaId: cuota.id,
    montoTotal,
    montoPagadoActual: 0,
    monto,
    fechaPago: offsetDias(cuota.fechaVencimiento, randInt(-1, 4)),
    observacion: "Pago parcial acordado con el cliente",
  });
}

async function fijarEstadoPrestamo(prestamoId: string, estado: EstadoPrestamoFinal) {
  await prisma.prestamo.update({ where: { id: prestamoId }, data: { estado } });
}

async function main() {
  const admin = await getOrCreateAdmin();
  const empresaId = admin.empresaId;
  const usuarioId = admin.id;

  console.log(`Usando empresa ${empresaId} / admin ${admin.email}`);
  console.log("Limpiando datos de demo previos...");
  await limpiarDatosDemo(empresaId);

  const ctxBase = { empresaId, usuarioId };

  console.log("Creando fuentes de ingreso...");
  const fuentes = await crearFuentesIngreso(empresaId);

  console.log("Creando clientes...");
  const clientes = {
    carlos: await crearCliente({
      ...ctxBase,
      nombre: "Carlos",
      apellido: "Gómez",
      documento: "3456789",
      telefono: "0981234567",
      direccion: "Asunción",
      email: "carlos.gomez@example.com",
    }),
    maria: await crearCliente({
      ...ctxBase,
      nombre: "María",
      apellido: "López",
      documento: "4123456",
      telefono: "0982345678",
      direccion: "San Lorenzo",
    }),
    juan: await crearCliente({
      ...ctxBase,
      nombre: "Juan",
      apellido: "Benítez",
      documento: "2987654",
      telefono: "0983456789",
      direccion: "Luque",
    }),
    ana: await crearCliente({
      ...ctxBase,
      nombre: "Ana",
      apellido: "Cáceres",
      documento: "3654321",
      telefono: "0984567890",
      direccion: "Fernando de la Mora",
      email: "ana.caceres@example.com",
    }),
    pedro: await crearCliente({
      ...ctxBase,
      nombre: "Pedro",
      apellido: "Rojas",
      documento: "4321987",
      telefono: "0985678901",
      direccion: "Capiatá",
    }),
    lucia: await crearCliente({
      ...ctxBase,
      nombre: "Lucía",
      apellido: "Fernández",
      documento: "3789456",
      telefono: "0986789012",
      direccion: "Lambaré",
    }),
    diego: await crearCliente({
      ...ctxBase,
      nombre: "Diego",
      apellido: "Martínez",
      documento: "4567123",
      telefono: "0987890123",
      direccion: "Ñemby",
    }),
    rosa: await crearCliente({
      ...ctxBase,
      nombre: "Rosa",
      apellido: "Villalba",
      documento: "2876543",
      telefono: "0988901234",
      direccion: "Mariano Roque Alonso",
      email: "rosa.villalba@example.com",
    }),
    elena: await crearCliente({
      ...ctxBase,
      nombre: "Elena",
      apellido: "Duarte",
      documento: "3123789",
      telefono: "0989012345",
      direccion: "San Lorenzo",
    }),
    ramon: await crearCliente({
      ...ctxBase,
      nombre: "Ramón",
      apellido: "Ortiz",
      documento: "4789123",
      telefono: "0990123456",
      direccion: "Asunción",
    }),
    sofia: await crearCliente({
      ...ctxBase,
      nombre: "Sofía",
      apellido: "Benítez",
      documento: "2345678",
      telefono: "0981112233",
      direccion: "Villa Elisa",
    }),
    miguel: await crearCliente({
      ...ctxBase,
      nombre: "Miguel",
      apellido: "Acosta",
      documento: "3987654",
      telefono: "0982223344",
      direccion: "Itauguá",
      email: "miguel.acosta@example.com",
    }),
    patricia: await crearCliente({
      ...ctxBase,
      nombre: "Patricia",
      apellido: "Silva",
      documento: "4234567",
      telefono: "0983334455",
      direccion: "Areguá",
    }),
    hugo: await crearCliente({
      ...ctxBase,
      nombre: "Hugo",
      apellido: "Cantero",
      documento: "2765432",
      telefono: "0984445566",
      direccion: "Limpio",
    }),
    valentina: await crearCliente({
      ...ctxBase,
      nombre: "Valentina",
      apellido: "Godoy",
      documento: "3567891",
      telefono: "0985556677",
      direccion: "San Antonio",
      email: "valentina.godoy@example.com",
    }),
    fabian: await crearCliente({
      ...ctxBase,
      nombre: "Fabián",
      apellido: "Insfrán",
      documento: "4890234",
      telefono: "0986667788",
      direccion: "Villeta",
    }),
  };

  console.log("Creando préstamos y su historial de cobros...");

  // 1) Activo, al día: se pagaron todas las cuotas vencidas hasta hoy.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.carlos.id,
      fuenteIngresoId: fuentes.ganado.id,
      monto: 3_000_000,
      interes: 600_000,
      cantidadCuotas: 6,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 1, 15),
    });
    await pagarPrimeras(cuotas, 5, { ...ctxBase, prestamoId: prestamo.id });
  }

  // 2) Activo con atraso moderado: una cuota parcial y dos cuotas vencidas sin pagar.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.maria.id,
      fuenteIngresoId: fuentes.supermercado.id,
      monto: 2_000_000,
      interes: 500_000,
      cantidadCuotas: 8,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 1, 5),
    });
    await pagarPrimeras(cuotas, 3, { ...ctxBase, prestamoId: prestamo.id });
    await pagarParcial(cuotas, 3, 0.6, { ...ctxBase, prestamoId: prestamo.id });
    // cuotas índice 4 y 5 (jun/jul) quedan vencidas sin pagar → ATRASADA
  }

  // 3) Activo con atraso severo: casi nada pagado, la mayoría de las cuotas está vencida.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.juan.id,
      fuenteIngresoId: fuentes.compraVenta.id,
      monto: 1_500_000,
      interes: 450_000,
      cantidadCuotas: 10,
      frecuencia: "QUINCENAL",
      fechaInicio: d(2026, 1, 10),
    });
    await pagarPrimeras(cuotas, 1, { ...ctxBase, prestamoId: prestamo.id });
    await pagarParcial(cuotas, 1, 0.4, { ...ctxBase, prestamoId: prestamo.id });
    // el resto queda vencido y sin pagar
  }

  // 4) Pagado por completo.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.ana.id,
      fuenteIngresoId: fuentes.ganado.id,
      monto: 1_000_000,
      interes: 150_000,
      cantidadCuotas: 4,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 1, 1),
    });
    await pagarPrimeras(cuotas, cuotas.length, { ...ctxBase, prestamoId: prestamo.id });
    await fijarEstadoPrestamo(prestamo.id, "PAGADO");
  }

  // 5) Pagado por completo (frecuencia semanal).
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.pedro.id,
      monto: 1_800_000,
      interes: 180_000,
      cantidadCuotas: 6,
      frecuencia: "SEMANAL",
      fechaInicio: d(2026, 2, 1),
    });
    await pagarPrimeras(cuotas, cuotas.length, { ...ctxBase, prestamoId: prestamo.id });
    await fijarEstadoPrestamo(prestamo.id, "PAGADO");
  }

  // 6) Cancelado: el saldo de todas las cuotas cobrado de una vez.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.lucia.id,
      fuenteIngresoId: fuentes.supermercado.id,
      monto: 2_500_000,
      interes: 750_000,
      cantidadCuotas: 12,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 1, 20),
    });
    await pagarPrimeras(cuotas, cuotas.length, { ...ctxBase, prestamoId: prestamo.id });
    await fijarEstadoPrestamo(prestamo.id, "CANCELADO");
  }

  // 7) Anulado: mal cargado, dado de baja sin ningún pago.
  {
    const { prestamo } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.diego.id,
      fuenteIngresoId: fuentes.compraVenta.id,
      monto: 800_000,
      interes: 160_000,
      cantidadCuotas: 6,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 3, 1),
    });
    await fijarEstadoPrestamo(prestamo.id, "ANULADO");
  }

  // 8) Activo con atraso, monto grande.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.rosa.id,
      fuenteIngresoId: fuentes.ganado.id,
      monto: 4_000_000,
      interes: 1_200_000,
      cantidadCuotas: 10,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 1, 12),
    });
    await pagarPrimeras(cuotas, 4, { ...ctxBase, prestamoId: prestamo.id });
    // el resto queda vencido y sin pagar
  }

  // 9) Activo con atraso leve, frecuencia quincenal.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.elena.id,
      fuenteIngresoId: fuentes.supermercado.id,
      monto: 1_200_000,
      interes: 300_000,
      cantidadCuotas: 8,
      frecuencia: "QUINCENAL",
      fechaInicio: d(2026, 1, 8),
    });
    await pagarPrimeras(cuotas, 5, { ...ctxBase, prestamoId: prestamo.id });
  }

  // 10) Préstamo recién iniciado, sin cuotas vencidas todavía.
  {
    await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.ramon.id,
      fuenteIngresoId: fuentes.compraVenta.id,
      monto: 1_500_000,
      interes: 300_000,
      cantidadCuotas: 6,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 7, 1),
    });
  }

  // 11) Pagado por completo, frecuencia diaria (préstamo corto).
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.sofia.id,
      fuenteIngresoId: fuentes.ganado.id,
      monto: 500_000,
      interes: 50_000,
      cantidadCuotas: 10,
      frecuencia: "DIARIA",
      fechaInicio: d(2026, 1, 5),
    });
    await pagarPrimeras(cuotas, cuotas.length, { ...ctxBase, prestamoId: prestamo.id });
    await fijarEstadoPrestamo(prestamo.id, "PAGADO");
  }

  // 12) Activo al día, frecuencia quincenal.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.miguel.id,
      fuenteIngresoId: fuentes.supermercado.id,
      monto: 2_200_000,
      interes: 440_000,
      cantidadCuotas: 8,
      frecuencia: "QUINCENAL",
      fechaInicio: d(2026, 2, 10),
    });
    await pagarPrimeras(cuotas, 5, { ...ctxBase, prestamoId: prestamo.id });
  }

  // 13) Activo con atraso moderado, monto grande.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.patricia.id,
      fuenteIngresoId: fuentes.compraVenta.id,
      monto: 3_500_000,
      interes: 700_000,
      cantidadCuotas: 10,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 1, 25),
    });
    await pagarPrimeras(cuotas, 2, { ...ctxBase, prestamoId: prestamo.id });
    await pagarParcial(cuotas, 2, 0.5, { ...ctxBase, prestamoId: prestamo.id });
  }

  // 14) Cancelado de una vez, sin categorizar.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.hugo.id,
      monto: 900_000,
      interes: 180_000,
      cantidadCuotas: 6,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 4, 1),
    });
    await pagarPrimeras(cuotas, cuotas.length, { ...ctxBase, prestamoId: prestamo.id });
    await fijarEstadoPrestamo(prestamo.id, "CANCELADO");
  }

  // 15) Recién iniciado, frecuencia semanal.
  {
    await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.valentina.id,
      fuenteIngresoId: fuentes.ganado.id,
      monto: 1_300_000,
      interes: 260_000,
      cantidadCuotas: 6,
      frecuencia: "SEMANAL",
      fechaInicio: d(2026, 7, 10),
    });
  }

  // 16) Activo con atraso severo, monto grande.
  {
    const { prestamo, cuotas } = await crearPrestamo({
      ...ctxBase,
      clienteId: clientes.fabian.id,
      fuenteIngresoId: fuentes.supermercado.id,
      monto: 2_800_000,
      interes: 840_000,
      cantidadCuotas: 12,
      frecuencia: "MENSUAL",
      fechaInicio: d(2026, 1, 18),
    });
    await pagarPrimeras(cuotas, 2, { ...ctxBase, prestamoId: prestamo.id });
  }

  const totales = {
    clientes: await prisma.cliente.count({ where: { empresaId } }),
    prestamos: await prisma.prestamo.count({ where: { empresaId } }),
    pagos: await prisma.pago.count({ where: { empresaId } }),
  };
  const porEstado = await prisma.prestamo.groupBy({
    by: ["estado"],
    where: { empresaId },
    _count: { _all: true },
  });
  const porFuente = await prisma.prestamo.groupBy({
    by: ["fuenteIngresoId"],
    where: { empresaId },
    _count: { _all: true },
  });
  const nombreFuentePorId: Record<string, string> = {
    [fuentes.ganado.id]: fuentes.ganado.nombre,
    [fuentes.supermercado.id]: fuentes.supermercado.nombre,
    [fuentes.compraVenta.id]: fuentes.compraVenta.nombre,
  };

  console.log("\nDatos de demo cargados:");
  console.log(totales);
  console.log("Préstamos por estado:", Object.fromEntries(porEstado.map((r) => [r.estado, r._count._all])));
  console.log(
    "Préstamos por fuente de ingreso:",
    Object.fromEntries(
      porFuente.map((r) => [
        r.fuenteIngresoId ? (nombreFuentePorId[r.fuenteIngresoId] ?? r.fuenteIngresoId) : "Sin categorizar",
        r._count._all,
      ])
    )
  );
  console.log(`\nIngresá con: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
