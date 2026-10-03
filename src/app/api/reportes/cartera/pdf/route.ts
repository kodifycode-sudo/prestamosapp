import { NextResponse } from "next/server";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getReporteCartera } from "@/lib/reportes-queries";
import { renderReportePdf } from "@/lib/pdf/reporte-pdf";
import { formatMonto } from "@/lib/format";
import { estadoPrestamoLabel, frecuenciaLabel, tipoInteresLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const reporte = await getReporteCartera(user);

  const buffer = await renderReportePdf({
    titulo: "Reporte de cartera",
    resumen: [
      { label: "Total desembolsado", valor: formatMonto(reporte.totalDesembolsado) },
      { label: "Total cobrado", valor: formatMonto(reporte.totalCobrado) },
      { label: "Cartera pendiente (activos)", valor: formatMonto(reporte.carteraPendiente) },
    ],
    tablas: [
      {
        titulo: "Préstamos por estado",
        columnas: ["Estado", "Cantidad", "Monto"],
        filas: reporte.porEstado.map((r) => [
          estadoPrestamoLabel[r.estado] ?? r.estado,
          r.cantidad,
          formatMonto(r.monto),
        ]),
      },
      {
        titulo: "Préstamos por tipo de interés",
        columnas: ["Tipo", "Cantidad"],
        filas: reporte.porTipoInteres.map((r) => [tipoInteresLabel[r.tipo] ?? r.tipo, r.cantidad]),
      },
      {
        titulo: "Préstamos por frecuencia",
        columnas: ["Frecuencia", "Cantidad"],
        filas: reporte.porFrecuencia.map((r) => [frecuenciaLabel[r.frecuencia] ?? r.frecuencia, r.cantidad]),
      },
      ...(reporte.porCobrador.length > 0
        ? [
            {
              titulo: "Cartera activa por cobrador",
              columnas: ["Cobrador", "Préstamos activos", "Cartera pendiente"],
              filas: reporte.porCobrador.map((r) => [
                r.cobrador,
                r.prestamosActivos,
                formatMonto(r.carteraPendiente),
              ]),
            },
          ]
        : []),
    ],
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reporte-cartera.pdf"`,
    },
  });
}
