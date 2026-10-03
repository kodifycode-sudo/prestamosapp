import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getDashboardStats } from "@/lib/dashboard";
import { formatMonto } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Coins, CalendarCheck, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CobrosChart } from "./cobros-chart";

export default async function DashboardPage() {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const stats = await getDashboardStats(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Resumen de la cartera y la actividad de cobros.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-bold text-muted-foreground">
              Cartera activa
              <Wallet className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatMonto(stats.carteraActiva)}
            </div>
            <p className="text-xs text-muted-foreground">{stats.prestamosActivos} préstamos activos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-bold text-muted-foreground">
              Cobrado hoy
              <Coins className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatMonto(stats.cobradoHoy)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-bold text-muted-foreground">
              Cobrado este mes
              <CalendarCheck className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatMonto(stats.cobradoMes)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-bold text-muted-foreground">
              Cuotas atrasadas
              <AlertTriangle className="h-4 w-4" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold ${stats.cuotasAtrasadas > 0 ? "text-destructive" : ""}`}>
              {stats.cuotasAtrasadas}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobros de los últimos 14 días</CardTitle>
        </CardHeader>
        <CardContent>
          <CobrosChart data={stats.cobrosPorDia} />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-lg font-medium">Próximos vencimientos (7 días)</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Cuota</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Pendiente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.proximasCuotas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No hay vencimientos en los próximos 7 días.
                  </TableCell>
                </TableRow>
              )}
              {stats.proximasCuotas.map((cuota) => (
                <TableRow key={cuota.id}>
                  <TableCell>
                    <Link href={`/clientes/${cuota.cliente.id}`} className="hover:underline">
                      {cuota.cliente.nombre} {cuota.cliente.apellido}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/prestamos/${cuota.prestamoId}`} className="hover:underline">
                      #{cuota.numero}
                    </Link>
                  </TableCell>
                  <TableCell>{cuota.fechaVencimiento.toLocaleDateString("es-AR")}</TableCell>
                  <TableCell>{formatMonto(cuota.pendiente)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
