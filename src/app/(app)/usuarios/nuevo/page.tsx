import { redirect } from "next/navigation";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { NuevoUsuarioForm } from "./nuevo-usuario-form";

export default async function NuevoUsuarioPage() {
  const user = await getUserFromToken();
  if (!user) redirect("/auth/salir");
  if (user.rol !== "ADMIN") redirect("/dashboard");

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <div className="w-full max-w-sm">
        <NuevoUsuarioForm />
      </div>
    </div>
  );
}
