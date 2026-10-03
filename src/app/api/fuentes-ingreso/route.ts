import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditCreate } from "@/utils/auditoria";

export const dynamic = "force-dynamic";

const fuenteIngresoSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().optional(),
});

export async function GET() {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const fuentes = await prisma.fuenteIngreso.findMany({
    where: { empresaId: user.empresaId },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(fuentes);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (user.rol !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = fuenteIngresoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const nueva = await auditCreate("FuenteIngreso", user.empresaId, user.usuarioId, (tx) =>
    tx.fuenteIngreso.create({
      data: {
        empresaId: user.empresaId,
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion,
      },
    })
  );

  return NextResponse.json(nueva, { status: 201 });
}
