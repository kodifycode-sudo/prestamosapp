import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import prisma from "@/libs/prisma";
import { UsuariosTable } from "./usuarios-table";

export default async function UsuariosPage() {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");
  if (user.rol !== "ADMIN") redirect("/dashboard");

  const usuarios = await prisma.usuario.findMany({
    where: { empresaId: user.empresaId },
    select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Administrá los cobradores y administradores del sistema.
        </p>
      </div>
      <UsuariosTable
        initialData={JSON.parse(JSON.stringify(usuarios))}
        currentUserId={user.usuarioId}
      />
    </div>
  );
}
