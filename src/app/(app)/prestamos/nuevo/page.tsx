import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getClientesForUser } from "@/lib/clientes";
import prisma from "@/libs/prisma";
import { PrestamoForm } from "./prestamo-form";

export default async function NuevoPrestamoPage(
  props: {
    searchParams: Promise<{ clienteId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const clientes = await getClientesForUser(user);
  const fuentesIngreso = await prisma.fuenteIngreso.findMany({
    where: { empresaId: user.empresaId, activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo préstamo</h1>
        <p className="text-sm text-muted-foreground">
          Definí las condiciones del préstamo y revisá el cronograma antes de confirmar.
        </p>
      </div>
      <PrestamoForm
        clientes={clientes.map((c) => ({
          id: c.id,
          nombre: `${c.nombre} ${c.apellido}`,
        }))}
        fuentesIngreso={fuentesIngreso}
        defaultClienteId={searchParams.clienteId}
      />
    </div>
  );
}
