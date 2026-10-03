import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getCuotasDelMes } from "@/lib/calendario-queries";
import { CalendarioCuotas } from "./calendario-cuotas";
import { claveFecha, hoyCalendario, inicioMesCalendario } from "@/lib/fechas";

/** Primer día del mes como fecha de calendario (00:00 UTC); por defecto, el mes en curso en la zona del negocio. */
function parseMes(value?: string) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }
  return inicioMesCalendario(hoyCalendario());
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  const mesDeReferencia = parseMes(searchParams.mes);
  const cuotas = await getCuotasDelMes(user, mesDeReferencia);
  // Se pasa como "yyyy-MM" (no ISO/UTC) para que el cliente lo parsee en hora local
  // y la navegación de meses no dependa de la zona horaria del servidor (UTC en Vercel).
  const mesParam = claveFecha(mesDeReferencia).slice(0, 7);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendario de cuotas</h1>
        <p className="text-sm text-muted-foreground">
          Vencimientos de cuotas organizados por día.
        </p>
      </div>
      <CalendarioCuotas
        mesDeReferencia={mesParam}
        cuotas={JSON.parse(JSON.stringify(cuotas))}
      />
    </div>
  );
}
