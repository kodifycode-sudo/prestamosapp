import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditCreate } from "@/utils/auditoria";
import { hashPassword } from "@/utils/hash";

export const dynamic = "force-dynamic";

const usuarioSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  rol: z.enum(["ADMIN", "COBRADOR"]),
});

export async function GET() {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (user.rol !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const usuarios = await prisma.usuario.findMany({
    where: { empresaId: user.empresaId },
    select: { id: true, nombre: true, email: true, rol: true, activo: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(usuarios);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (user.rol !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json();
  const parsed = usuarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
  if (existente) {
    return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
  }

  const nuevo = await auditCreate("Usuario", user.empresaId, user.usuarioId, async () => {
    const creado = await prisma.usuario.create({
      data: {
        empresaId: user.empresaId,
        nombre: parsed.data.nombre,
        email: parsed.data.email,
        password: await hashPassword(parsed.data.password),
        rol: parsed.data.rol,
      },
    });
    return { ...creado, password: "***" };
  });

  return NextResponse.json(nuevo, { status: 201 });
}
