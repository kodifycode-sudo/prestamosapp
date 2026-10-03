import { cache } from "react";
import jwt from "jsonwebtoken";
import { cookies, headers } from "next/headers";
import prisma from "@/libs/prisma";

export type TokenPayload = {
  usuarioId: string;
  empresaId: string;
  email: string;
  nombre: string;
  rol: "ADMIN" | "COBRADOR";
};

/** Lo que viaja firmado en el JWT: los datos de sesión más la versión de sesión del usuario. */
type JwtPayload = TokenPayload & { sv?: number };

/**
 * Devuelve el usuario de la sesión actual. Además de validar el JWT, relee el
 * usuario en la base: si fue desactivado o eliminado la sesión deja de valer
 * aunque el token no haya vencido, y el rol/empresa siempre son los vigentes.
 * También deja de valer si la contraseña cambió después de emitido el token.
 * `cache` evita repetir la consulta dentro de un mismo request (layout + page).
 */
export const getUserFromToken = cache(async (): Promise<TokenPayload | null> => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET no está definido");
  }

  // 1. Cookie (web)
  const cookieStore = await cookies();
  let rawToken = cookieStore.get("tokenPrestamos")?.value;

  // 2. Authorization: Bearer (mobile)
  if (!rawToken) {
    const headerStore = await headers();
    const auth = headerStore.get("authorization") ?? headerStore.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      rawToken = auth.slice(7);
    }
  }

  if (!rawToken) return null;

  let payload: JwtPayload;
  try {
    payload = jwt.verify(rawToken, process.env.JWT_SECRET) as JwtPayload;
  } catch (error) {
    console.error("Error al verificar el token:", error);
    return null;
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.usuarioId },
    select: { id: true, empresaId: true, email: true, nombre: true, rol: true, activo: true, sesionVersion: true },
  });
  if (!usuario || !usuario.activo) return null;
  // Tokens emitidos antes del último cambio de contraseña ya no valen. Los anteriores
  // a este control no traen `sv` y cuentan como versión 0.
  if ((payload.sv ?? 0) !== usuario.sesionVersion) return null;

  return {
    usuarioId: usuario.id,
    empresaId: usuario.empresaId,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
  };
});
