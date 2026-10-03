import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditCreate } from "@/utils/auditoria";
import { scopeEmpresa } from "@/lib/scope";

export const dynamic = "force-dynamic";

const simulacionSchema = z.object({
  clienteNombre: z.string().min(1, "El nombre es obligatorio"),
  clienteEmail: z.string().email().optional().or(z.literal("")),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0").transform(Math.round),
  interes: z.coerce.number().min(0, "El interés no puede ser negativo").transform(Math.round),
  cantidadCuotas: z.coerce.number().int().min(1, "Debe haber al menos 1 cuota"),
  frecuencia: z.enum(["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"]),
  fechaInicio: z.coerce.date(),
});

export async function GET() {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const simulaciones = await prisma.simulacion.findMany({
    where: scopeEmpresa(user),
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(simulaciones);
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json();
  const parsed = simulacionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { clienteEmail, ...rest } = parsed.data;

  const nueva = await auditCreate("Simulacion", user.empresaId, user.usuarioId, () =>
    prisma.simulacion.create({
      data: {
        ...rest,
        empresaId: user.empresaId,
        clienteEmail: clienteEmail || undefined,
        usuarioId: user.usuarioId,
      },
    })
  );

  return NextResponse.json(nueva, { status: 201 });
}
