import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Cierra la sesión del lado del servidor y lleva al login. Las páginas protegidas
 * redirigen acá cuando el token ya no corresponde a un usuario activo: si fueran
 * directo a /auth/login, el middleware vería la cookie todavía válida y las
 * devolvería al dashboard en un bucle.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/auth/login", request.url));
  response.cookies.delete("tokenPrestamos");
  return response;
}
