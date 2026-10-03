import prisma from "@/libs/prisma";
import { hashPassword } from "@/utils/hash";
import { NextRequest, NextResponse } from "next/server";
import { passwordSchema } from "@/lib/password";
import { hashTokenReset } from "@/lib/token-reset";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = body?.password;

  if (!token || !password) {
    return NextResponse.json(
      { error: "El token y la contraseña son obligatorios" },
      { status: 400 }
    );
  }

  const passwordValida = passwordSchema.safeParse(password);
  if (!passwordValida.success) {
    return NextResponse.json({ error: passwordValida.error.issues[0].message }, { status: 400 });
  }

  const tokenHash = hashTokenReset(token);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: tokenHash } });

  if (!resetToken) {
    return NextResponse.json(
      { error: "El enlace es inválido o ya fue utilizado." },
      { status: 400 }
    );
  }

  if (resetToken.used) {
    return NextResponse.json(
      { error: "Este enlace ya fue utilizado." },
      { status: 400 }
    );
  }

  if (new Date() > resetToken.expiresAt) {
    return NextResponse.json(
      { error: "El enlace ha expirado. Solicitá uno nuevo." },
      { status: 400 }
    );
  }

  const hashedPassword = await hashPassword(passwordValida.data);

  // Marcar el enlace como usado y cambiar la contraseña van juntos y de forma atómica:
  // si dos pedidos llegan a la vez con el mismo enlace, solo uno lo consume.
  const consumido = await prisma.$transaction(async (tx) => {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { token: tokenHash, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    if (count === 0) return false;
    await tx.usuario.update({
      where: { email: resetToken.email },
      // Cierra las sesiones abiertas con la contraseña anterior.
      data: { password: hashedPassword, sesionVersion: { increment: 1 } },
    });
    return true;
  });

  if (!consumido) {
    return NextResponse.json({ error: "Este enlace ya fue utilizado." }, { status: 400 });
  }

  return NextResponse.json({ message: "Contraseña actualizada correctamente." });
}
