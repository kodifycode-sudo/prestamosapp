import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken, type TokenPayload } from "@/utils/getUserFromToken";
import { auditDelete, auditUpdate } from "@/utils/auditoria";
import { esUsuarioDeLaEmpresa } from "@/lib/clientes";

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

  const body = await request.json();
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

  const actualizado = await auditUpdate(
    "Cliente",
    user.empresaId,
    user.usuarioId,
    cliente.id,
    (tx) => tx.cliente.findUnique({ where: { id: cliente.id } }),
    (tx) => tx.cliente.update({ where: { id: cliente.id }, data })
  );

  return NextResponse.json(actualizado);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ clienteId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { cliente, forbidden } = await getClienteScoped(params.clienteId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const cantidadPrestamos = await prisma.prestamo.count({
    where: { clienteId: cliente.id },
  });
  if (cantidadPrestamos > 0) {
    return NextResponse.json(
      { error: "No se puede eliminar un cliente con préstamos asociados" },
      { status: 409 }
    );
  }

  await auditDelete(
    "Cliente",
    user.empresaId,
    user.usuarioId,
    cliente.id,
    (tx) => tx.cliente.findUnique({ where: { id: cliente.id } }),
    (tx) => tx.cliente.delete({ where: { id: cliente.id } })
  );

  return NextResponse.json({ success: true });
}
