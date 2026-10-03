import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getPrestamosFacetCounts, getPrestamosForUser } from "@/lib/prestamos-queries";
import { PrestamosTable } from "./prestamos-table";

function parseList(value?: string) {
  return value ? value.split(",").filter(Boolean) : [];
}

export default async function PrestamosPage({
  searchParams,
}: {
  searchParams: { estado?: string; tipo?: string; frecuencia?: string; q?: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const filters = {
    estado: parseList(searchParams.estado),
    tipoInteres: parseList(searchParams.tipo),
    frecuencia: parseList(searchParams.frecuencia),
    q: searchParams.q,
  };

  const prestamos = await getPrestamosForUser(user, filters);
  const facetCounts = await getPrestamosFacetCounts(user);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Préstamos</h1>
          <p className="text-sm text-muted-foreground">
            Cartera de préstamos activos e históricos.
          </p>
        </div>
      </div>
      <PrestamosTable
        initialData={JSON.parse(JSON.stringify(prestamos))}
        facetCounts={facetCounts}
        initialFilters={{
          estado: filters.estado,
          tipo: filters.tipoInteres,
          frecuencia: filters.frecuencia,
          q: searchParams.q ?? "",
        }}
      />
    </div>
  );
}
