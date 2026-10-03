import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { esUsuarioDeLaEmpresa } from "@/lib/clientes";
import { auditCreate } from "@/utils/auditoria";
import { scopeEmpresa } from "@/lib/scope";
import { esDuplicado } from "@/lib/errores";

export const dynamic = "force-dynamic";

const DOCUMENTO_EN_USO = "Ya existe un cliente con ese documento";

const clienteSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  apellido: z.string().min(1, "El apellido es obligatorio"),
  documento: z.string().min(1, "El documento es obligatorio"),
  telefono: z.string().min(1, "El teléfono es obligatorio"),
  direccion: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  usuarioId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim();

  const clientes = await prisma.cliente.findMany({
    where: {
      ...scopeEmpresa(user),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { apellido: { contains: q, mode: "insensitive" } },
              { documento: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { usuario: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(clientes);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = clienteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, usuarioId, ...rest } = parsed.data;

  const existente = await prisma.cliente.findUnique({
    where: { empresaId_documento: { empresaId: user.empresaId, documento: rest.documento } },
  });
  if (existente) {
    return NextResponse.json(
      { error: DOCUMENTO_EN_USO },
      { status: 409 }
    );
  }

  const asignadoA = user.rol === "ADMIN" ? usuarioId ?? user.usuarioId : user.usuarioId;
  if (!(await esUsuarioDeLaEmpresa(asignadoA, user.empresaId))) {
    return NextResponse.json({ error: "Cobrador no encontrado" }, { status: 400 });
  }

  let nuevo;
  try {
    nuevo = await auditCreate("Cliente", user.empresaId, user.usuarioId, (tx) =>
      tx.cliente.create({
        data: { ...rest, empresaId: user.empresaId, email: email || undefined, usuarioId: asignadoA },
      })
    );
  } catch (error) {
    if (esDuplicado(error)) return NextResponse.json({ error: DOCUMENTO_EN_USO }, { status: 409 });
    throw error;
  }

  return NextResponse.json(nuevo, { status: 201 });
}
