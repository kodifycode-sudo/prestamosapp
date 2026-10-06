import { formatFecha, hoyCalendario } from "@/lib/fechas";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { formatMonto } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CuotaEstadoBadge } from "./cuota-estado-badge";
import { PrestamoActions } from "./prestamo-actions";
import { CuotaRowActions } from "./cuota-row-actions";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { estadoEfectivoPrestamo } from "@/lib/estado-prestamo";

const estadoVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVO: "default",
  PAGADO: "secondary",
  ATRASADO: "destructive",
  CANCELADO: "outline",
  REFINANCIADO: "outline",
  ANULADO: "outline",
};

export default async function PrestamoDetailPage(
  props: {
    params: Promise<{ prestamoId: string }>;
  }
) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const prestamo = await prisma.prestamo.findUnique({
    where: { id: params.prestamoId },
    include: {
      fuenteIngreso: { select: { id: true, nombre: true } },
      refinanciacionComoAnterior: { include: { prestamoNuevo: true } },
      refinanciacionComoNuevo: {
        include: { prestamoAnterior: { include: { cliente: true } } },
      },
    },
  });
  if (!prestamo || prestamo.empresaId !== user.empresaId) notFound();
  if (user.rol === "COBRADOR" && prestamo.usuarioId !== user.usuarioId) notFound();

  const cliente = await prisma.cliente.findUnique({ where: { id: prestamo.clienteId } });
  const cuotas = await prisma.cuota.findMany({
    where: { prestamoId: prestamo.id },
    orderBy: { numero: "asc" },
  });

  const hoy = hoyCalendario();
  const saldoPendiente = cuotas.reduce(
    (sum, c) => (c.estado !== "PAGADA" ? sum + (Number(c.montoTotal) - Number(c.montoPagado)) : sum),
    0
  );
  const puedeRefinanciar = prestamo.estado === "ACTIVO" && saldoPendiente > 0;
  const estadoEfectivo = estadoEfectivoPrestamo(prestamo.estado, cuotas, hoy);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Préstamo de{" "}
            <Link href={`/clientes/${cliente?.id}`} className="hover:underline">
              {cliente?.nombre} {cliente?.apellido}
            </Link>
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatMonto(Number(prestamo.monto))} en {prestamo.cantidadCuotas} cuotas ·{" "}
            {prestamo.frecuencia}
            {prestamo.interes !== null ? (
              <> · Interés {formatMonto(Number(prestamo.interes))}</>
            ) : (
              <>
                {" "}
                · {prestamo.tipoInteres}
                {Number(prestamo.iva) > 0 && <> · IVA {Number(prestamo.iva)}% financiado</>}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {prestamo.fuenteIngreso && <Badge variant="outline">{prestamo.fuenteIngreso.nombre}</Badge>}
          <Badge variant={estadoVariant[estadoEfectivo]}>{estadoEfectivo}</Badge>
          {puedeRefinanciar && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/refinanciaciones/nueva?prestamoId=${prestamo.id}`}>
                <RefreshCw className="size-4" />
                Refinanciar
              </Link>
            </Button>
          )}
          <PrestamoActions
            prestamoId={prestamo.id}
            estado={prestamo.estado}
            esAdmin={user.rol === "ADMIN"}
            tienePagos={cuotas.some((c) => Number(c.montoPagado) > 0)}
            saldoPendiente={Math.round(saldoPendiente)}
            cuotasPendientes={cuotas.filter((c) => c.estado !== "PAGADA").length}
          />
        </div>
      </div>

      {prestamo.refinanciacionComoAnterior && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          Este préstamo fue refinanciado.{" "}
          <Link
            href={`/prestamos/${prestamo.refinanciacionComoAnterior.prestamoNuevoId}`}
            className="font-medium underline"
          >
            Ver préstamo nuevo
          </Link>
        </div>
      )}
      {prestamo.refinanciacionComoNuevo && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          Este préstamo surge de refinanciar un préstamo anterior de{" "}
          {prestamo.refinanciacionComoNuevo.prestamoAnterior.cliente.nombre}.{" "}
          <Link
            href={`/prestamos/${prestamo.refinanciacionComoNuevo.prestamoAnteriorId}`}
            className="font-medium underline"
          >
            Ver préstamo anterior
          </Link>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Capital</TableHead>
              <TableHead>Interés</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pagado</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuotas.map((cuota) => {
              const pendiente = Number(cuota.montoTotal) - Number(cuota.montoPagado);
              const puedeCobrar = cuota.estado !== "PAGADA" && prestamo.estado === "ACTIVO";
              return (
                <TableRow key={cuota.id}>
                  <TableCell>{cuota.numero}</TableCell>
                  <TableCell>{formatFecha(cuota.fechaVencimiento)}</TableCell>
                  <TableCell>{formatMonto(Number(cuota.montoCapital))}</TableCell>
                  <TableCell>{formatMonto(Number(cuota.montoInteres))}</TableCell>
                  <TableCell>{formatMonto(Number(cuota.montoTotal))}</TableCell>
                  <TableCell>{formatMonto(Number(cuota.montoPagado))}</TableCell>
                  <TableCell>
                    {cuota.estado === "PARCIAL" ? (
                      <span className="font-medium text-destructive">{formatMonto(pendiente)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <CuotaEstadoBadge estado={cuota.estado} fechaVencimiento={cuota.fechaVencimiento} hoy={hoy} />
                  </TableCell>
                  <TableCell className="text-right">
                    {puedeCobrar && (
                      <CuotaRowActions cuotaId={cuota.id} numero={cuota.numero} pendiente={pendiente} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
