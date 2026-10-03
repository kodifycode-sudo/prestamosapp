import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import prisma from "@/libs/prisma";
import { getPrestamosForUser } from "@/lib/prestamos-queries";
import {
  getReporteCartera,
  getReporteCategorias,
  getReporteCobrosPorCobrador,
  getReporteMorosidad,
  getReporteProximosVencimientos,
} from "@/lib/reportes-queries";
import { ReportesTabs } from "./reportes-tabs";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: { desde?: string; hasta?: string; tab?: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const cartera = await getReporteCartera(user);
  const categorias = await getReporteCategorias(user);
  const cobrosPorCobrador = await getReporteCobrosPorCobrador(user, searchParams.desde, searchParams.hasta);
  const morosidad = await getReporteMorosidad(user);
  const proximosVencimientos = await getReporteProximosVencimientos(user, 15);
  const prestamosDetalle = await getPrestamosForUser(user);
  const fuentesIngreso = await prisma.fuenteIngreso.findMany({
    where: { empresaId: user.empresaId },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Cartera, categorías, cobros por cobrador, morosidad y próximos vencimientos, con exportación a PDF.
        </p>
      </div>
      <ReportesTabs
        cartera={JSON.parse(JSON.stringify(cartera))}
        categorias={JSON.parse(JSON.stringify(categorias))}
        prestamosDetalle={JSON.parse(JSON.stringify(prestamosDetalle))}
        fuentesIngreso={fuentesIngreso}
        cobrosPorCobrador={JSON.parse(JSON.stringify(cobrosPorCobrador))}
        morosidad={JSON.parse(JSON.stringify(morosidad))}
        proximosVencimientos={JSON.parse(JSON.stringify(proximosVencimientos))}
        isAdmin={user.rol === "ADMIN"}
        tabInicial={searchParams.tab ?? "cartera"}
        rangoInicial={{ desde: searchParams.desde ?? "", hasta: searchParams.hasta ?? "" }}
      />
    </div>
  );
}
