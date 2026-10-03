import { formatFecha } from "@/lib/fechas";
import { notFound, redirect } from "next/navigation";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { generarCuotas } from "@/lib/prestamos";
import { formatMonto } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SimulacionDetailActions } from "./simulacion-detail-actions";

export default async function SimulacionDetailPage({
  params,
}: {
  params: { simulacionId: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const simulacion = await prisma.simulacion.findUnique({ where: { id: params.simulacionId } });
  if (!simulacion || simulacion.empresaId !== user.empresaId) notFound();
  if (user.rol === "COBRADOR" && simulacion.usuarioId !== user.usuarioId) notFound();

  const esInteresFijo = simulacion.interes !== null;
  const cuotas = esInteresFijo
    ? generarCuotas({
        monto: Number(simulacion.monto),
        interes: Number(simulacion.interes),
        cantidadCuotas: simulacion.cantidadCuotas,
        frecuencia: simulacion.frecuencia,
        fechaInicio: simulacion.fechaInicio,
      })
    : generarCuotas({
        monto: Number(simulacion.monto),
        tasaInteres: Number(simulacion.tasaInteres),
        iva: Number(simulacion.iva),
        cantidadCuotas: simulacion.cantidadCuotas,
        tipoInteres: simulacion.tipoInteres!,
        frecuencia: simulacion.frecuencia,
        fechaInicio: simulacion.fechaInicio,
      });
  const montoFinanciado = Math.round(Number(simulacion.monto) * (1 + Number(simulacion.iva) / 100));
  const totalCuotas = cuotas.reduce((sum, c) => sum + c.montoTotal, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Simulación para {simulacion.clienteNombre}</h1>
          <p className="text-sm text-muted-foreground">
            {formatMonto(Number(simulacion.monto))} en {simulacion.cantidadCuotas} cuotas ·{" "}
            {simulacion.frecuencia}
            {esInteresFijo ? (
              <> · Interés {formatMonto(Number(simulacion.interes))}</>
            ) : (
              <>
                {" "}
                · {simulacion.tipoInteres}
                {Number(simulacion.iva) > 0 && <> · IVA {Number(simulacion.iva)}% financiado</>}
              </>
            )}
            {simulacion.clienteEmail && <> · {simulacion.clienteEmail}</>}
          </p>
        </div>
        <SimulacionDetailActions
          simulacion={{
            id: simulacion.id,
            clienteNombre: simulacion.clienteNombre,
            clienteEmail: simulacion.clienteEmail ?? "",
            monto: Number(simulacion.monto),
            interes: Number(simulacion.interes ?? 0),
            cantidadCuotas: simulacion.cantidadCuotas,
            frecuencia: simulacion.frecuencia,
            fechaInicio: simulacion.fechaInicio.toISOString().slice(0, 10),
          }}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Capital</TableHead>
              <TableHead>Interés</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuotas.map((cuota) => (
              <TableRow key={cuota.numero}>
                <TableCell>{cuota.numero}</TableCell>
                <TableCell>{formatFecha(cuota.fechaVencimiento)}</TableCell>
                <TableCell>{formatMonto(cuota.montoCapital)}</TableCell>
                <TableCell>{formatMonto(cuota.montoInteres)}</TableCell>
                <TableCell>{formatMonto(cuota.montoTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        {!esInteresFijo && Number(simulacion.iva) > 0 && (
          <p>
            Monto financiado (incluye IVA {Number(simulacion.iva)}%):{" "}
            <span className="font-medium text-foreground">{formatMonto(montoFinanciado)}</span>
          </p>
        )}
        <p>
          Total a pagar: <span className="font-medium text-foreground">{formatMonto(totalCuotas)}</span>
        </p>
      </div>
    </div>
  );
}
