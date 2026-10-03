import { Prisma } from "@prisma/client";

/**
 * Choque con un índice único (P2002): dos altas simultáneas, o una edición que
 * repite un email o documento existente. Se responde 409 en lugar de un error 500.
 */
export function esDuplicado(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
