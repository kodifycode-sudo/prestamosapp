import crypto from "crypto";
import prisma from "@/libs/prisma";
import { NextRequest, NextResponse } from "next/server";
import { ipDelCliente, minutosDeEspera, registrarIntento, superaLimite } from "@/lib/limite-intentos";

export const dynamic = "force-dynamic";

/** Misma respuesta exista o no la cuenta, para no revelar qué correos están registrados. */
const SUCCESS_MESSAGE =
  "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json({ error: "El email es obligatorio" }, { status: 400 });
  }

  if (!process.env.BREVO_API_KEY) {
    console.error("BREVO_API_KEY no está definido en las variables de entorno.");
    return NextResponse.json({ error: "No se pudo enviar el correo" }, { status: 500 });
  }

  const ip = ipDelCliente();
  if (await superaLimite("RESET", email, ip)) {
    return NextResponse.json(
      {
        error: `Ya se pidieron varios enlaces. Esperá ${minutosDeEspera("RESET")} minutos e intentá de nuevo.`,
      },
      { status: 429 }
    );
  }
  // Cada pedido cuenta, exista o no la cuenta: evita usar el endpoint para mandar correos en masa.
  await registrarIntento("RESET", email, ip);

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario) {
    return NextResponse.json({ message: SUCCESS_MESSAGE });
  }

  await prisma.passwordResetToken.updateMany({
    where: { email, used: false },
    data: { used: true },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { token, email, expiresAt },
  });

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@prestosistema.com";

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "PRESTO", email: senderEmail },
        to: [{ email }],
        subject: "Restablecer contraseña — PRESTO",
        htmlContent: `
<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
  <h2 style="color: #1a1a1a;">Restablecer contraseña</h2>
  <p style="color: #555;">Hola <strong>${usuario.nombre}</strong>,</p>
  <p style="color: #555;">
    Recibimos una solicitud para restablecer la contraseña de tu cuenta en PRESTO.
    Hacé clic en el botón para continuar:
  </p>
  <a href="${resetUrl}"
     style="display: inline-block; margin: 24px 0; padding: 12px 24px;
            background-color: #16332a; color: white; text-decoration: none;
            border-radius: 8px; font-weight: bold;">
    Restablecer contraseña
  </a>
  <p style="color: #999; font-size: 13px;">
    Este enlace vence en <strong>1 hora</strong>. Si no solicitaste este cambio,
    podés ignorar este correo.
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="color: #bbb; font-size: 12px;">PRESTO — Gestión de Préstamos</p>
</div>`,
      }),
    });

    if (!resp.ok) {
      console.error("Error al enviar el correo con Brevo:", await resp.text());
    }
  } catch (err) {
    console.error("Error al enviar el correo con Brevo:", err);
  }

  return NextResponse.json({ message: SUCCESS_MESSAGE });
}
