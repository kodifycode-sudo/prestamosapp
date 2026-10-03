import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import prisma from "@/libs/prisma";
import { EmpresaForm } from "./empresa-form";

export default async function EmpresaPage() {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");
  if (user.rol !== "ADMIN") redirect("/dashboard");

  const empresa = await prisma.empresa.findUnique({ where: { id: user.empresaId } });
  if (!empresa) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Datos de tu empresa dentro del sistema.
        </p>
      </div>
      <EmpresaForm
        empresa={{
          nombre: empresa.nombre,
          ruc: empresa.ruc ?? "",
          telefono: empresa.telefono ?? "",
          direccion: empresa.direccion ?? "",
        }}
      />
    </div>
  );
}
