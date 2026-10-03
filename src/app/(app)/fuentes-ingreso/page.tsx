import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import prisma from "@/libs/prisma";
import { FuentesTable } from "./fuentes-table";

export default async function FuentesIngresoPage() {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");
  if (user.rol !== "ADMIN") redirect("/dashboard");

  const fuentes = await prisma.fuenteIngreso.findMany({
    where: { empresaId: user.empresaId },
    orderBy: { nombre: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Fuentes de ingreso</h1>
        <p className="text-sm text-muted-foreground">
          Categorías de origen del capital que prestás (venta de ganado, supermercado, etc.),
          para saber de dónde sale la plata de cada préstamo y cómo rinde cada una.
        </p>
      </div>
      <FuentesTable initialData={JSON.parse(JSON.stringify(fuentes))} />
    </div>
  );
}
