import { inicioMesSiguienteCalendario, sumarDias } from "@/lib/fechas";
import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { scopeEmpresa } from "@/lib/scope";

/** `mesDeReferencia`: primer día del mes como fecha de calendario (00:00 UTC). */
export async function getCuotasDelMes(user: TokenPayload, mesDeReferencia: Date) {
  // Grilla de lunes a domingo que contiene el mes completo (getUTCDay: 0 = domingo).
  const diasDesdeLunes = (fecha: Date) => (fecha.getUTCDay() + 6) % 7;
  const ultimoDiaMes = sumarDias(inicioMesSiguienteCalendario(mesDeReferencia), -1);
  const inicioGrilla = sumarDias(mesDeReferencia, -diasDesdeLunes(mesDeReferencia));
  const finGrilla = sumarDias(ultimoDiaMes, 6 - diasDesdeLunes(ultimoDiaMes));

  return prisma.cuota.findMany({
    where: {
      fechaVencimiento: { gte: inicioGrilla, lte: finGrilla },
      prestamo: scopeEmpresa(user),
    },
    include: {
      prestamo: {
        include: { cliente: { select: { id: true, nombre: true, apellido: true } } },
      },
    },
    orderBy: { fechaVencimiento: "asc" },
  });
}
