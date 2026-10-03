import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getRefinanciacionesForUser } from "@/lib/refinanciaciones-queries";
import { RefinanciacionesTable } from "./refinanciaciones-table";

export default async function RefinanciacionesPage(
  props: {
    searchParams: Promise<{ q?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const refinanciaciones = await getRefinanciacionesForUser(user, searchParams.q);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Refinanciaciones</h1>
        <p className="text-sm text-muted-foreground">
          Historial de préstamos refinanciados y los nuevos préstamos generados.
        </p>
      </div>
      <RefinanciacionesTable
        initialData={JSON.parse(JSON.stringify(refinanciaciones))}
        initialQuery={searchParams.q ?? ""}
      />
    </div>
  );
}
