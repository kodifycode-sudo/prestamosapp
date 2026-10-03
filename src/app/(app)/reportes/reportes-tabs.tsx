"use client";

import { formatFecha } from "@/lib/fechas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FileDown } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { formatMonto } from "@/lib/format";
import { estadoPrestamoLabel, frecuenciaLabel, tipoInteresLabel } from "@/lib/labels";
import { CategoriasDetalleTable } from "./categorias-detalle-table";

const estadoVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVO: "default",
  PAGADO: "secondary",
  ATRASADO: "destructive",
  CANCELADO: "outline",
  REFINANCIADO: "outline",
};

type ReporteCartera = {
  totalDesembolsado: number;
  totalCobrado: number;
  carteraPendiente: number;
  porEstado: { estado: string; cantidad: number; monto: number }[];
  porTipoInteres: { tipo: string; cantidad: number }[];
  porFrecuencia: { frecuencia: string; cantidad: number }[];
  porCobrador: { cobrador: string; prestamosActivos: number; carteraPendiente: number }[];
};

type ReporteCategorias = {
  totalCapitalPrestado: number;
  totalInteresGenerado: number;
  categorias: {
    fuenteIngresoId: string | null;
    nombre: string;
    cantidadPrestamos: number;
    capitalPrestado: number;
    interesGenerado: number;
    totalCobrado: number;
    carteraPendiente: number;
    rendimiento: number;
  }[];
};

type ReporteCobrosPorCobrador = {
  desde: string | null;
  hasta: string | null;
  totalCobrado: number;
  filas: {
    usuarioId: string;
    cobrador: string;
    cantidadPagos: number;
    totalCobrado: number;
    efectivo: number;
    transferencia: number;
    otro: number;
  }[];
};

type ReporteMorosidad = {
  totalAtrasado: number;
  cantidadCuotasAtrasadas: number;
  buckets: { rango: string; cantidad: number; monto: number }[];
  clientes: {
    clienteId: string;
    clienteNombre: string;
    cobrador: string;
    cantidadCuotasAtrasadas: number;
    montoAtrasado: number;
    diasMaxAtraso: number;
  }[];
};

type ReporteProximosVencimientos = {
  dias: number;
  totalAVencer: number;
  cuotas: {
    cuotaId: string;
    prestamoId: string;
    numero: number;
    clienteNombre: string;
    cobrador: string;
    fechaVencimiento: string;
    monto: number;
  }[];
};

function StatTile({ label, valor }: { label: string; valor: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{valor}</div>
      </CardContent>
    </Card>
  );
}

function DescargarPdfButton({ href }: { href: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.open(href, "_blank")}>
      <FileDown className="size-4" />
      Descargar PDF
    </Button>
  );
}

type PrestamoDetalle = {
  id: string;
  monto: string;
  interes: string | null;
  totalAPagar: number;
  saldoPendiente: number;
  estado: string;
  estadoEfectivo: string;
  frecuencia: string;
  cantidadCuotas: number;
  cliente: { id: string; nombre: string; apellido: string };
  fuenteIngreso: { id: string; nombre: string } | null;
};

export function ReportesTabs({
  cartera,
  categorias,
  prestamosDetalle,
  fuentesIngreso,
  cobrosPorCobrador,
  morosidad,
  proximosVencimientos,
  isAdmin,
  tabInicial,
  rangoInicial,
}: {
  cartera: ReporteCartera;
  categorias: ReporteCategorias;
  prestamosDetalle: PrestamoDetalle[];
  fuentesIngreso: { id: string; nombre: string }[];
  cobrosPorCobrador: ReporteCobrosPorCobrador;
  morosidad: ReporteMorosidad;
  proximosVencimientos: ReporteProximosVencimientos;
  isAdmin: boolean;
  tabInicial: string;
  rangoInicial: { desde: string; hasta: string };
}) {
  const router = useRouter();

  const rangoActual: DateRange | undefined = rangoInicial.desde
    ? {
        from: new Date(`${rangoInicial.desde}T00:00:00`),
        to: rangoInicial.hasta ? new Date(`${rangoInicial.hasta}T00:00:00`) : undefined,
      }
    : undefined;

  function setRango(rango: DateRange | undefined) {
    const params = new URLSearchParams();
    params.set("tab", "cobros");
    if (rango?.from) params.set("desde", format(rango.from, "yyyy-MM-dd"));
    if (rango?.to) params.set("hasta", format(rango.to, "yyyy-MM-dd"));
    router.push(`/reportes?${params.toString()}`);
  }

  const cobrosPdfHref = `/api/reportes/cobros-cobrador/pdf${
    rangoInicial.desde ? `?desde=${rangoInicial.desde}&hasta=${rangoInicial.hasta || rangoInicial.desde}` : ""
  }`;

  return (
    <Tabs defaultValue={tabInicial} className="space-y-4">
      <TabsList>
        <TabsTrigger value="cartera">Cartera</TabsTrigger>
        <TabsTrigger value="categorias">Categorías</TabsTrigger>
        <TabsTrigger value="cobros">Cobros por cobrador</TabsTrigger>
        <TabsTrigger value="morosidad">Morosidad</TabsTrigger>
        <TabsTrigger value="vencimientos">Próximos vencimientos</TabsTrigger>
      </TabsList>

      <TabsContent value="cartera" className="space-y-4">
        <div className="flex justify-end">
          <DescargarPdfButton href="/api/reportes/cartera/pdf" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Total desembolsado" valor={formatMonto(cartera.totalDesembolsado)} />
          <StatTile label="Total cobrado" valor={formatMonto(cartera.totalCobrado)} />
          <StatTile label="Cartera pendiente (activos)" valor={formatMonto(cartera.carteraPendiente)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Préstamos por estado</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cartera.porEstado.map((r) => (
                    <TableRow key={r.estado}>
                      <TableCell>
                        <Badge variant={estadoVariant[r.estado]}>
                          {estadoPrestamoLabel[r.estado] ?? r.estado}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.cantidad}</TableCell>
                      <TableCell>{formatMonto(r.monto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por tipo y frecuencia</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Tipo de interés</p>
                {cartera.porTipoInteres.map((r) => (
                  <div key={r.tipo} className="flex justify-between py-1 text-sm">
                    <span>{tipoInteresLabel[r.tipo] ?? r.tipo}</span>
                    <span className="font-medium">{r.cantidad}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Frecuencia</p>
                {cartera.porFrecuencia.map((r) => (
                  <div key={r.frecuencia} className="flex justify-between py-1 text-sm">
                    <span>{frecuenciaLabel[r.frecuencia] ?? r.frecuencia}</span>
                    <span className="font-medium">{r.cantidad}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {isAdmin && cartera.porCobrador.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cartera activa por cobrador</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cobrador</TableHead>
                    <TableHead>Préstamos activos</TableHead>
                    <TableHead>Cartera pendiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cartera.porCobrador.map((r) => (
                    <TableRow key={r.cobrador}>
                      <TableCell>{r.cobrador}</TableCell>
                      <TableCell>{r.prestamosActivos}</TableCell>
                      <TableCell>{formatMonto(r.carteraPendiente)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="categorias" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile label="Capital prestado" valor={formatMonto(categorias.totalCapitalPrestado)} />
          <StatTile label="Interés generado" valor={formatMonto(categorias.totalInteresGenerado)} />
        </div>

        {categorias.categorias.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Capital prestado por categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categorias.categorias} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="nombre"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => [formatMonto(Number(value)), "Capital prestado"]}
                  />
                  <Bar dataKey="capitalPrestado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead>Préstamos</TableHead>
                <TableHead>Capital prestado</TableHead>
                <TableHead>Interés generado</TableHead>
                <TableHead>Cobrado</TableHead>
                <TableHead>Cartera pendiente</TableHead>
                <TableHead>Rendimiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorias.categorias.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay préstamos cargados todavía.
                  </TableCell>
                </TableRow>
              )}
              {categorias.categorias.map((c) => (
                <TableRow key={c.fuenteIngresoId ?? "sin-categoria"}>
                  <TableCell className="font-medium">
                    {c.fuenteIngresoId === null ? (
                      <Badge variant="outline">Sin categorizar</Badge>
                    ) : (
                      c.nombre
                    )}
                  </TableCell>
                  <TableCell>{c.cantidadPrestamos}</TableCell>
                  <TableCell>{formatMonto(c.capitalPrestado)}</TableCell>
                  <TableCell>{formatMonto(c.interesGenerado)}</TableCell>
                  <TableCell>{formatMonto(c.totalCobrado)}</TableCell>
                  <TableCell>{formatMonto(c.carteraPendiente)}</TableCell>
                  <TableCell className="font-medium">{c.rendimiento.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div>
          <h3 className="mb-3 text-base font-medium">Detalle de préstamos</h3>
          <CategoriasDetalleTable prestamos={prestamosDetalle} fuentesIngreso={fuentesIngreso} />
        </div>
      </TabsContent>

      <TabsContent value="cobros" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateRangeFilter title="Período" value={rangoActual} onChange={setRango} />
          <DescargarPdfButton href={cobrosPdfHref} />
        </div>

        <StatTile label="Total cobrado" valor={formatMonto(cobrosPorCobrador.totalCobrado)} />

        {cobrosPorCobrador.filas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cobrado por cobrador</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={cobrosPorCobrador.filas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="cobrador"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => [formatMonto(Number(value)), "Cobrado"]}
                  />
                  <Bar dataKey="totalCobrado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cobrador</TableHead>
                <TableHead>Cant. pagos</TableHead>
                <TableHead>Efectivo</TableHead>
                <TableHead>Transferencia</TableHead>
                <TableHead>Otro</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cobrosPorCobrador.filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay cobros registrados en este período.
                  </TableCell>
                </TableRow>
              )}
              {cobrosPorCobrador.filas.map((f) => (
                <TableRow key={f.usuarioId}>
                  <TableCell className="font-medium">{f.cobrador}</TableCell>
                  <TableCell>{f.cantidadPagos}</TableCell>
                  <TableCell>{formatMonto(f.efectivo)}</TableCell>
                  <TableCell>{formatMonto(f.transferencia)}</TableCell>
                  <TableCell>{formatMonto(f.otro)}</TableCell>
                  <TableCell className="font-medium">{formatMonto(f.totalCobrado)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="morosidad" className="space-y-4">
        <div className="flex justify-end">
          <DescargarPdfButton href="/api/reportes/morosidad/pdf" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Total atrasado" valor={formatMonto(morosidad.totalAtrasado)} />
          <StatTile label="Cuotas atrasadas" valor={String(morosidad.cantidadCuotasAtrasadas)} />
          <StatTile label="Clientes en mora" valor={String(morosidad.clientes.length)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Antigüedad de la mora</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rango</TableHead>
                  <TableHead>Cuotas</TableHead>
                  <TableHead>Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {morosidad.buckets.map((b) => (
                  <TableRow key={b.rango}>
                    <TableCell>{b.rango}</TableCell>
                    <TableCell>{b.cantidad}</TableCell>
                    <TableCell>{formatMonto(b.monto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Cobrador</TableHead>
                <TableHead>Cuotas atrasadas</TableHead>
                <TableHead>Días máx. atraso</TableHead>
                <TableHead>Monto atrasado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {morosidad.clientes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay clientes en mora. 🎉
                  </TableCell>
                </TableRow>
              )}
              {morosidad.clientes.map((c) => (
                <TableRow key={c.clienteId}>
                  <TableCell>
                    <Link href={`/clientes/${c.clienteId}`} className="font-medium hover:underline">
                      {c.clienteNombre}
                    </Link>
                  </TableCell>
                  <TableCell>{c.cobrador}</TableCell>
                  <TableCell>{c.cantidadCuotasAtrasadas}</TableCell>
                  <TableCell>{c.diasMaxAtraso}</TableCell>
                  <TableCell className="font-medium text-destructive">
                    {formatMonto(c.montoAtrasado)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="vencimientos" className="space-y-4">
        <div className="flex justify-end">
          <DescargarPdfButton href="/api/reportes/proximos-vencimientos/pdf" />
        </div>
        <StatTile
          label={`Total a vencer (${proximosVencimientos.dias} días)`}
          valor={formatMonto(proximosVencimientos.totalAVencer)}
        />
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Cobrador</TableHead>
                <TableHead>Cuota</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proximosVencimientos.cuotas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay cuotas por vencer en los próximos {proximosVencimientos.dias} días.
                  </TableCell>
                </TableRow>
              )}
              {proximosVencimientos.cuotas.map((c) => (
                <TableRow key={c.cuotaId}>
                  <TableCell>{c.clienteNombre}</TableCell>
                  <TableCell>{c.cobrador}</TableCell>
                  <TableCell>
                    <Link href={`/prestamos/${c.prestamoId}`} className="hover:underline">
                      #{c.numero}
                    </Link>
                  </TableCell>
                  <TableCell>{formatFecha(c.fechaVencimiento)}</TableCell>
                  <TableCell>{formatMonto(c.monto)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
    </Tabs>
  );
}
