import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getSimulacionesFacetCounts, getSimulacionesForUser } from "@/lib/simulaciones";
import { SimulacionesTable } from "./simulaciones-table";

function parseList(value?: string) {
  return value ? value.split(",").filter(Boolean) : [];
}

export default async function SimuladorPage({
  searchParams,
}: {
  searchParams: { tipo?: string; frecuencia?: string; q?: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const filters = {
    tipoInteres: parseList(searchParams.tipo),
    frecuencia: parseList(searchParams.frecuencia),
    q: searchParams.q,
  };

  const simulaciones = await getSimulacionesForUser(user, filters);
  const facetCounts = await getSimulacionesFacetCounts(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Simulador de préstamos</h1>
        <p className="text-sm text-muted-foreground">
          Armá cotizaciones para clientes potenciales, editalas y generá un PDF para enviar por mail.
        </p>
      </div>
      <SimulacionesTable
        initialData={JSON.parse(JSON.stringify(simulaciones))}
        facetCounts={facetCounts}
        initialFilters={{
          tipo: filters.tipoInteres,
          frecuencia: filters.frecuencia,
          q: searchParams.q ?? "",
        }}
      />
    </div>
  );
}
