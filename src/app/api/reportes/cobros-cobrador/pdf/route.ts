import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getReporteCobrosPorCobrador } from "@/lib/reportes-queries";
import { renderReportePdf } from "@/lib/pdf/reporte-pdf";
import { formatMonto } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const desde = request.nextUrl.searchParams.get("desde") ?? undefined;
  const hasta = request.nextUrl.searchParams.get("hasta") ?? undefined;

  const reporte = await getReporteCobrosPorCobrador(user, desde, hasta);

  const buffer = await renderReportePdf({
    titulo: "Cobros por cobrador",
    subtitulo:
      reporte.desde || reporte.hasta
        ? `Período: ${reporte.desde ?? "inicio"} a ${reporte.hasta ?? "hoy"}`
        : "Histórico completo",
    resumen: [{ label: "Total cobrado", valor: formatMonto(reporte.totalCobrado) }],
    tablas: [
      {
        titulo: "Detalle por cobrador",
        columnas: ["Cobrador", "Cant. pagos", "Efectivo", "Transferencia", "Otro", "Total"],
        filas: reporte.filas.map((f) => [
          f.cobrador,
          f.cantidadPagos,
          formatMonto(f.efectivo),
          formatMonto(f.transferencia),
          formatMonto(f.otro),
          formatMonto(f.totalCobrado),
        ]),
      },
    ],
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reporte-cobros-por-cobrador.pdf"`,
    },
  });
}
