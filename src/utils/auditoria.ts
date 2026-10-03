import type { Prisma } from "@prisma/client";
import prisma from "@/libs/prisma";

type Accion = "CREATE" | "UPDATE" | "DELETE";
type Tx = Prisma.TransactionClient;
type OpcionesTx = { maxWait?: number; timeout?: number };

/**
 * Registra un cambio en la auditoría. Si se pasa `db` (una transacción en curso),
 * el registro queda atado a ella: si el cambio se revierte, el registro también.
 */
export async function auditar(
  tabla: string,
  accion: Accion,
  empresaId: string,
  usuarioId: string,
  options: {
    registroId: string;
    oldValues?: unknown;
    newValues?: unknown;
  },
  db: Tx = prisma
) {
  await db.auditoria.create({
    data: {
      tabla,
      registroId: options.registroId,
      accion,
      oldValues: options.oldValues
        ? JSON.stringify(options.oldValues)
        : undefined,
      newValues: options.newValues
        ? JSON.stringify(options.newValues)
        : undefined,
      empresaId,
      usuarioId,
    },
  });
}

/*
 * Los helpers ejecutan el cambio y su registro de auditoría en una misma
 * transacción: nunca queda un cambio sin auditar ni una auditoría de un cambio
 * que no ocurrió. Las funciones reciben `tx` y deben usarlo en lugar de `prisma`.
 */

export async function auditCreate<T>(
  tabla: string,
  empresaId: string,
  usuarioId: string,
  createFn: (tx: Tx) => Promise<T & { id: string }>,
  opciones?: OpcionesTx
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const nuevo = await createFn(tx);
    await auditar(tabla, "CREATE", empresaId, usuarioId, {
      registroId: nuevo.id,
      newValues: nuevo,
    }, tx);
    return nuevo;
  }, opciones);
}

export async function auditUpdate<T>(
  tabla: string,
  empresaId: string,
  usuarioId: string,
  id: string,
  getOldFn: (tx: Tx) => Promise<T | null>,
  updateFn: (tx: Tx) => Promise<T & { id: string }>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const oldRecord = await getOldFn(tx);
    const updated = await updateFn(tx);
    await auditar(tabla, "UPDATE", empresaId, usuarioId, {
      registroId: id,
      oldValues: oldRecord,
      newValues: updated,
    }, tx);
    return updated;
  });
}

export async function auditDelete<T>(
  tabla: string,
  empresaId: string,
  usuarioId: string,
  id: string,
  getOldFn: (tx: Tx) => Promise<T | null>,
  deleteFn: (tx: Tx) => Promise<unknown>
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const oldRecord = await getOldFn(tx);
    await deleteFn(tx);
    await auditar(tabla, "DELETE", empresaId, usuarioId, {
      registroId: id,
      oldValues: oldRecord,
    }, tx);
  });
}
