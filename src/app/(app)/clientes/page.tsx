import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getClientesForUser } from "@/lib/clientes";
import { ClientesTable } from "./clientes-table";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const clientes = await getClientesForUser(user, searchParams.q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Gestioná los clientes y su información de contacto en el sistema.
        </p>
      </div>
      <ClientesTable
        initialData={JSON.parse(JSON.stringify(clientes))}
        initialQuery={searchParams.q ?? ""}
      />
    </div>
  );
}
