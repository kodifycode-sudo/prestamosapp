import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getAuditoriaFacetCounts, getAuditorias } from "@/lib/auditoria-queries";
import { AuditoriaTable } from "./auditoria-table";

function parseList(value?: string) {
  return value ? value.split(",").filter(Boolean) : [];
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: { tabla?: string; accion?: string; q?: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");
  if (user.rol !== "ADMIN") redirect("/dashboard");

  const filters = {
    tabla: parseList(searchParams.tabla),
    accion: parseList(searchParams.accion),
    q: searchParams.q,
  };

  const auditorias = await getAuditorias(user, filters);
  const facetCounts = await getAuditoriaFacetCounts(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Registro de todas las altas, modificaciones y eliminaciones realizadas en el sistema.
        </p>
      </div>
      <AuditoriaTable
        initialData={JSON.parse(JSON.stringify(auditorias))}
        facetCounts={facetCounts}
        initialFilters={{
          tabla: filters.tabla,
          accion: filters.accion,
          q: searchParams.q ?? "",
        }}
      />
    </div>
  );
}
