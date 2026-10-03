import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/utils/getUserFromToken";

export const dynamic = "force-dynamic";

/**
 * Cierra una sesión que ya no es válida (usuario desactivado o token vencido) y
 * lleva al login. Las páginas protegidas redirigen acá en ese caso. Si la sesión
 * sigue siendo válida no se toca: así un enlace externo a esta ruta no puede
 * cerrarle la sesión a nadie (para salir a propósito está POST /api/auth/logout).
 */
export async function GET(request: NextRequest) {
  if (await getUserFromToken()) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  const response = NextResponse.redirect(new URL("/auth/login", request.url));
  response.cookies.delete("tokenPrestamos");
  return response;
}
