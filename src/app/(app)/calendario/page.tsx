import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { getCuotasDelMes } from "@/lib/calendario-queries";
import { CalendarioCuotas } from "./calendario-cuotas";

function parseMes(value?: string) {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
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
  const mesParam = `${mesDeReferencia.getFullYear()}-${String(mesDeReferencia.getMonth() + 1).padStart(2, "0")}`;

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
