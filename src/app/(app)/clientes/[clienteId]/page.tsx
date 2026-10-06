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
import { ClienteDetailActions } from "./cliente-detail-actions";
import { hoyCalendario } from "@/lib/fechas";
import { estadoEfectivoPrestamo } from "@/lib/estado-prestamo";

const estadoVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVO: "default",
  PAGADO: "secondary",
  ATRASADO: "destructive",
  CANCELADO: "outline",
  REFINANCIADO: "outline",
  ANULADO: "outline",
};

export default async function ClienteDetailPage(
  props: {
    params: Promise<{ clienteId: string }>;
  }
) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const cliente = await prisma.cliente.findUnique({
    where: { id: params.clienteId },
    include: { usuario: { select: { nombre: true } } },
  });

  if (!cliente || cliente.empresaId !== user.empresaId) notFound();
  if (user.rol === "COBRADOR" && cliente.usuarioId !== user.usuarioId) notFound();

  const prestamos = await prisma.prestamo.findMany({
    where: { clienteId: cliente.id },
    include: {
      fuenteIngreso: { select: { id: true, nombre: true } },
      cuotas: { select: { estado: true, fechaVencimiento: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const hoy = hoyCalendario();
  const estadosEfectivos = new Map(
    prestamos.map((p) => [p.id, estadoEfectivoPrestamo(p.estado, p.cuotas, hoy)])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {cliente.nombre} {cliente.apellido}
          </h1>
          <p className="text-sm text-muted-foreground">
            Documento {cliente.documento} · Cobrador: {cliente.usuario.nombre}
          </p>
        </div>
        <ClienteDetailActions
          cliente={{
            id: cliente.id,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            documento: cliente.documento,
            telefono: cliente.telefono,
            direccion: cliente.direccion ?? "",
            email: cliente.email ?? "",
          }}
          hasPrestamos={prestamos.length > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-md border p-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground">Teléfono</div>
          <div className="font-medium">{cliente.telefono}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Dirección</div>
          <div className="font-medium">{cliente.direccion || "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Email</div>
          <div className="font-medium">{cliente.email || "—"}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Préstamos</h2>
          <Link
            href={`/prestamos/nuevo?clienteId=${cliente.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            + Nuevo préstamo
          </Link>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Monto</TableHead>
                <TableHead>Cuotas</TableHead>
                <TableHead>Interés</TableHead>
                <TableHead>Frecuencia</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {prestamos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Este cliente todavía no tiene préstamos.
                  </TableCell>
                </TableRow>
              )}
              {prestamos.map((prestamo) => (
                <TableRow key={prestamo.id}>
                  <TableCell>{formatMonto(Number(prestamo.monto))}</TableCell>
                  <TableCell>{prestamo.cantidadCuotas}</TableCell>
                  <TableCell>
                    {prestamo.interes !== null ? formatMonto(Number(prestamo.interes)) : prestamo.tipoInteres}
                  </TableCell>
                  <TableCell>{prestamo.frecuencia}</TableCell>
                  <TableCell>
                    {prestamo.fuenteIngreso ? (
                      <Badge variant="outline">{prestamo.fuenteIngreso.nombre}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={estadoVariant[estadosEfectivos.get(prestamo.id)!]}>
                      {estadosEfectivos.get(prestamo.id)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/prestamos/${prestamo.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Ver
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
