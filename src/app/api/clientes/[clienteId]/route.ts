import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken, type TokenPayload } from "@/utils/getUserFromToken";
import { auditDelete, auditUpdate } from "@/utils/auditoria";
import { esUsuarioDeLaEmpresa } from "@/lib/clientes";
import { esDuplicado } from "@/lib/errores";

export const dynamic = "force-dynamic";

const clienteUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  apellido: z.string().min(1).optional(),
  documento: z.string().min(1).optional(),
  telefono: z.string().min(1).optional(),
  direccion: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  usuarioId: z.string().optional(),
});

/** Rechazo de negocio detectado dentro de la transacción. */
class ClienteConPrestamos extends Error {}

async function getClienteScoped(clienteId: string, user: TokenPayload) {
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente || cliente.empresaId !== user.empresaId) return { cliente: null, forbidden: false };
  if (user.rol === "COBRADOR" && cliente.usuarioId !== user.usuarioId) {
    return { cliente: null, forbidden: true };
  }
  return { cliente, forbidden: false };
}

export async function GET(request: NextRequest, props: { params: Promise<{ clienteId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { cliente, forbidden } = await getClienteScoped(params.clienteId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const prestamos = await prisma.prestamo.findMany({
    where: { clienteId: cliente.id },
    include: { fuenteIngreso: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ...cliente, prestamos });
}

export async function PUT(request: NextRequest, props: { params: Promise<{ clienteId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { cliente, forbidden } = await getClienteScoped(params.clienteId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = clienteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, usuarioId, ...rest } = parsed.data;
  if (user.rol === "ADMIN" && usuarioId && !(await esUsuarioDeLaEmpresa(usuarioId, user.empresaId))) {
    return NextResponse.json({ error: "Cobrador no encontrado" }, { status: 400 });
  }
  const data = {
    ...rest,
    ...(email !== undefined ? { email: email || null } : {}),
    ...(user.rol === "ADMIN" && usuarioId ? { usuarioId } : {}),
  };

  const cambiaCobrador = data.usuarioId !== undefined && data.usuarioId !== cliente.usuarioId;

  let actualizado;
  try {
    actualizado = await auditUpdate(
      "Cliente",
      user.empresaId,
      user.usuarioId,
      cliente.id,
      (tx) => tx.cliente.findUnique({ where: { id: cliente.id } }),
      async (tx) => {
        const guardado = await tx.cliente.update({ where: { id: cliente.id }, data });
        // Los préstamos siguen al cliente: el nuevo cobrador es quien los ve y los cobra.
        // Los pagos ya registrados conservan a quien los cobró.
        if (cambiaCobrador) {
          await tx.prestamo.updateMany({ where: { clienteId: cliente.id }, data: { usuarioId: guardado.usuarioId } });
        }
        return guardado;
      }
    );
  } catch (error) {
    if (esDuplicado(error)) {
      return NextResponse.json({ error: "Ya existe un cliente con ese documento" }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json(actualizado);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ clienteId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { cliente, forbidden } = await getClienteScoped(params.clienteId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  try {
    await auditDelete(
      "Cliente",
      user.empresaId,
      user.usuarioId,
      cliente.id,
      async (tx) => {
        // Bloqueo el cliente: el alta de préstamos también lo bloquea, así no se
        // le crea un préstamo entre el conteo y el borrado (no hay claves foráneas en la base).
        await tx.$queryRaw`SELECT id FROM "Cliente" WHERE id = ${cliente.id} FOR UPDATE`;
        return tx.cliente.findUnique({ where: { id: cliente.id } });
      },
      async (tx) => {
        if ((await tx.prestamo.count({ where: { clienteId: cliente.id } })) > 0) {
          throw new ClienteConPrestamos();
        }
        await tx.cliente.delete({ where: { id: cliente.id } });
      }
    );
  } catch (error) {
    if (error instanceof ClienteConPrestamos) {
      return NextResponse.json(
        { error: "No se puede eliminar un cliente con préstamos asociados" },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}
