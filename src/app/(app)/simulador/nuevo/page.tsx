import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { SimulacionForm } from "../simulacion-form";

export default async function NuevaSimulacionPage() {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nueva simulación</h1>
        <p className="text-sm text-muted-foreground">
          Cargá los datos del préstamo y revisá el cronograma antes de guardar.
        </p>
      </div>
      <SimulacionForm />
    </div>
  );
}
