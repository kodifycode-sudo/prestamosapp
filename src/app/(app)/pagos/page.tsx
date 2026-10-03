import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getPagosFacetCounts, getPagosForUser } from "@/lib/pagos-queries";
import { PagosTable } from "./pagos-table";

function parseList(value?: string) {
  return value ? value.split(",").filter(Boolean) : [];
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: { metodo?: string; cobrador?: string; desde?: string; hasta?: string; q?: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const filters = {
    metodoPago: parseList(searchParams.metodo),
    cobradorId: parseList(searchParams.cobrador),
    desde: searchParams.desde,
    hasta: searchParams.hasta,
    q: searchParams.q,
  };

  const pagos = await getPagosForUser(user, filters);
  const facetCounts = await getPagosFacetCounts(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pagos</h1>
        <p className="text-sm text-muted-foreground">Historial de cobros registrados.</p>
      </div>
      <PagosTable
        initialData={JSON.parse(JSON.stringify(pagos))}
        facetCounts={facetCounts}
        isAdmin={user.rol === "ADMIN"}
        initialFilters={{
          metodo: filters.metodoPago,
          cobrador: filters.cobradorId,
          desde: filters.desde ?? "",
          hasta: filters.hasta ?? "",
          q: searchParams.q ?? "",
        }}
      />
    </div>
  );
}
