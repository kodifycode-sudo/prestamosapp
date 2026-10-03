import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken, type TokenPayload } from "@/utils/getUserFromToken";
import { auditDelete, auditUpdate } from "@/utils/auditoria";

export const dynamic = "force-dynamic";

const simulacionUpdateSchema = z.object({
  clienteNombre: z.string().min(1).optional(),
  clienteEmail: z.string().email().optional().or(z.literal("")),
  monto: z.coerce.number().positive().transform(Math.round).optional(),
  interes: z.coerce.number().min(0).transform(Math.round).optional(),
  cantidadCuotas: z.coerce.number().int().min(1).optional(),
  frecuencia: z.enum(["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"]).optional(),
  fechaInicio: z.coerce.date().optional(),
});

async function getSimulacionScoped(id: string, user: TokenPayload) {
  const simulacion = await prisma.simulacion.findUnique({ where: { id } });
  if (!simulacion || simulacion.empresaId !== user.empresaId) {
    return { simulacion: null, forbidden: false };
  }
  if (user.rol === "COBRADOR" && simulacion.usuarioId !== user.usuarioId) {
    return { simulacion: null, forbidden: true };
  }
  return { simulacion, forbidden: false };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { simulacionId: string } }
) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { simulacion, forbidden } = await getSimulacionScoped(params.simulacionId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!simulacion) return NextResponse.json({ error: "Simulación no encontrada" }, { status: 404 });

  return NextResponse.json(simulacion);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { simulacionId: string } }
) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { simulacion, forbidden } = await getSimulacionScoped(params.simulacionId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!simulacion) return NextResponse.json({ error: "Simulación no encontrada" }, { status: 404 });

  const body = await request.json();
  const parsed = simulacionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { clienteEmail, ...rest } = parsed.data;
  const data = { ...rest, ...(clienteEmail !== undefined ? { clienteEmail: clienteEmail || null } : {}) };

  const actualizada = await auditUpdate(
    "Simulacion",
    user.empresaId,
    user.usuarioId,
    simulacion.id,
    () => prisma.simulacion.findUnique({ where: { id: simulacion.id } }),
    () => prisma.simulacion.update({ where: { id: simulacion.id }, data })
  );

  return NextResponse.json(actualizada);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { simulacionId: string } }
) {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { simulacion, forbidden } = await getSimulacionScoped(params.simulacionId, user);
  if (forbidden) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!simulacion) return NextResponse.json({ error: "Simulación no encontrada" }, { status: 404 });

  await auditDelete(
    "Simulacion",
    user.empresaId,
    user.usuarioId,
    simulacion.id,
    () => prisma.simulacion.findUnique({ where: { id: simulacion.id } }),
    () => prisma.simulacion.delete({ where: { id: simulacion.id } })
  );

  return NextResponse.json({ success: true });
}
