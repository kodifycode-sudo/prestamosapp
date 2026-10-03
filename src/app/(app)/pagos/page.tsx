import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getPagosFacetCounts, getPagosForUser, parsePagosFilters } from "@/lib/pagos-queries";
import { PagosTable } from "./pagos-table";

export default async function PagosPage(
  props: {
    searchParams: Promise<{ metodo?: string; cobrador?: string; desde?: string; hasta?: string; q?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const filters = parsePagosFilters(searchParams);

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
          metodo: filters.metodoPago ?? [],
          cobrador: filters.cobradorId ?? [],
          desde: filters.desde ?? "",
          hasta: filters.hasta ?? "",
          q: searchParams.q ?? "",
        }}
      />
    </div>
  );
}
