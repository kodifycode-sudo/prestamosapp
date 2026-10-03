import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditUpdate } from "@/utils/auditoria";

export const dynamic = "force-dynamic";

const empresaUpdateSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  ruc: z.string().optional(),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
});

export async function GET() {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const empresa = await prisma.empresa.findUnique({ where: { id: user.empresaId } });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  return NextResponse.json(empresa);
}

export async function PUT(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (user.rol !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json();
  const parsed = empresaUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ruc, telefono, direccion, ...rest } = parsed.data;
  const data = {
    ...rest,
    ruc: ruc || null,
    telefono: telefono || null,
    direccion: direccion || null,
  };

  const actualizada = await auditUpdate(
    "Empresa",
    user.empresaId,
    user.usuarioId,
    user.empresaId,
    () => prisma.empresa.findUnique({ where: { id: user.empresaId } }),
    () => prisma.empresa.update({ where: { id: user.empresaId }, data })
  );

  return NextResponse.json(actualizada);
}
