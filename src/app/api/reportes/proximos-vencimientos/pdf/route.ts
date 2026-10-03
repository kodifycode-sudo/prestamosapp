import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getReporteProximosVencimientos } from "@/lib/reportes-queries";
import { renderReportePdf } from "@/lib/pdf/reporte-pdf";
import { formatMonto } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const dias = Number(request.nextUrl.searchParams.get("dias") ?? "15");
  const reporte = await getReporteProximosVencimientos(user, dias);

  const buffer = await renderReportePdf({
    titulo: "Próximos vencimientos",
    subtitulo: `Próximos ${reporte.dias} días`,
    resumen: [{ label: "Total a vencer", valor: formatMonto(reporte.totalAVencer) }],
    tablas: [
      {
        titulo: "Cuotas por vencer",
        columnas: ["Cliente", "Cobrador", "Cuota", "Vencimiento", "Monto"],
        filas: reporte.cuotas.map((c) => [
          c.clienteNombre,
          c.cobrador,
          `#${c.numero}`,
          c.fechaVencimiento.toLocaleDateString("es-AR"),
          formatMonto(c.monto),
        ]),
      },
    ],
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reporte-proximos-vencimientos.pdf"`,
    },
  });
}
