import prisma from "@/libs/prisma";
import type { TokenPayload } from "@/utils/getUserFromToken";
import { scopeEmpresa } from "@/lib/scope";

export async function getClientesForUser(user: TokenPayload, q?: string) {
  return prisma.cliente.findMany({
    where: {
      ...scopeEmpresa(user),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" as const } },
              { apellido: { contains: q, mode: "insensitive" as const } },
              { documento: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/** El cobrador asignado a un cliente tiene que ser un usuario de la misma empresa. */
export async function esUsuarioDeLaEmpresa(usuarioId: string, empresaId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { empresaId: true } });
  return usuario?.empresaId === empresaId;
}
