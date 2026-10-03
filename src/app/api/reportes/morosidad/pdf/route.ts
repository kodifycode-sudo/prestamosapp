import { NextResponse } from "next/server";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getReporteMorosidad } from "@/lib/reportes-queries";
import { renderReportePdf } from "@/lib/pdf/reporte-pdf";
import { formatMonto } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const reporte = await getReporteMorosidad(user);

  const buffer = await renderReportePdf({
    titulo: "Reporte de morosidad",
    resumen: [
      { label: "Total atrasado", valor: formatMonto(reporte.totalAtrasado) },
      { label: "Cuotas atrasadas", valor: String(reporte.cantidadCuotasAtrasadas) },
      { label: "Clientes en mora", valor: String(reporte.clientes.length) },
    ],
    tablas: [
      {
        titulo: "Antigüedad de la mora",
        columnas: ["Rango", "Cantidad de cuotas", "Monto"],
        filas: reporte.buckets.map((b) => [b.rango, b.cantidad, formatMonto(b.monto)]),
      },
      {
        titulo: "Clientes en mora",
        columnas: ["Cliente", "Cobrador", "Cuotas atrasadas", "Días máx. atraso", "Monto atrasado"],
        filas: reporte.clientes.map((c) => [
          c.clienteNombre,
          c.cobrador,
          c.cantidadCuotasAtrasadas,
          c.diasMaxAtraso,
          formatMonto(c.montoAtrasado),
        ]),
      },
    ],
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reporte-morosidad.pdf"`,
    },
  });
}
