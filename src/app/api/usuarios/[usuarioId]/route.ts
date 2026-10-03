import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { getUserFromToken } from "@/utils/getUserFromToken";
import { auditUpdate } from "@/utils/auditoria";
import { hashPassword } from "@/utils/hash";
import { passwordSchema } from "@/lib/password";
import { emailSchema } from "@/lib/email";

export const dynamic = "force-dynamic";

const usuarioUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  email: emailSchema.optional(),
  rol: z.enum(["ADMIN", "COBRADOR"]).optional(),
  activo: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export async function PUT(request: NextRequest, props: { params: Promise<{ usuarioId: string }> }) {
  const params = await props.params;
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (user.rol !== "ADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const existente = await prisma.usuario.findUnique({ where: { id: params.usuarioId } });
  if (!existente || existente.empresaId !== user.empresaId) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = usuarioUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (existente.id === user.usuarioId && parsed.data.activo === false) {
    return NextResponse.json({ error: "No podés desactivar tu propio usuario" }, { status: 400 });
  }
  if (existente.id === user.usuarioId && parsed.data.rol === "COBRADOR") {
    return NextResponse.json({ error: "No podés quitarte el rol de administrador" }, { status: 400 });
  }

  const { password, ...rest } = parsed.data;

  const actualizado = await auditUpdate(
    "Usuario",
    user.empresaId,
    user.usuarioId,
    existente.id,
    async (tx) => {
      const anterior = await tx.usuario.findUnique({ where: { id: existente.id } });
      return anterior ? { ...anterior, password: "***" } : null;
    },
    async (tx) => {
      const guardado = await tx.usuario.update({
        where: { id: existente.id },
        data: { ...rest, ...(password ? { password: await hashPassword(password) } : {}) },
      });
      return { ...guardado, password: "***" };
    }
  );

  return NextResponse.json(actualizado);
}
