import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getPrestamosRefinanciables } from "@/lib/refinanciaciones-queries";
import { RefinanciacionForm } from "./refinanciacion-form";

export default async function NuevaRefinanciacionPage({
  searchParams,
}: {
  searchParams: { prestamoId?: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const prestamos = await getPrestamosRefinanciables(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nueva refinanciación</h1>
        <p className="text-sm text-muted-foreground">
          Convertí el saldo pendiente de un préstamo activo en un nuevo préstamo con otras condiciones.
        </p>
      </div>
      <RefinanciacionForm
        prestamos={prestamos.map((p) => ({
          id: p.id,
          clienteNombre: `${p.cliente.nombre} ${p.cliente.apellido}`,
          saldoPendiente: p.saldoPendiente,
          interes: Number(p.interes ?? 0),
          frecuencia: p.frecuencia,
        }))}
        defaultPrestamoId={searchParams.prestamoId}
      />
    </div>
  );
}
