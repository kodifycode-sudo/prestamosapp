import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/libs/prisma";
import { hashPassword } from "@/utils/hash";
import { auditar } from "@/utils/auditoria";
import { passwordSchema } from "@/lib/password";
import { escapeHtml } from "@/utils/html";
import { emailSchema } from "@/lib/email";
import { esDuplicado } from "@/lib/errores";
import { ipDelCliente, minutosDeEspera, registrarIntento, superaLimite } from "@/lib/limite-intentos";

export const dynamic = "force-dynamic";

const registroSchema = z
  .object({
    empresaNombre: z.string().min(1, "El nombre de la empresa es obligatorio"),
    nombre: z.string().min(1, "El nombre es obligatorio"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

const EMAIL_EN_USO = "Ya existe un usuario con ese email";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = registroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ip = await ipDelCliente();
  if (await superaLimite("REGISTRO", parsed.data.email, ip)) {
    return NextResponse.json(
      {
        error: `Demasiados registros desde esta conexión. Esperá ${minutosDeEspera("REGISTRO")} minutos e intentá de nuevo.`,
      },
      { status: 429 }
    );
  }
  // Cada intento cuenta, salga bien o no: evita crear empresas o mandar correos en masa.
  await registrarIntento("REGISTRO", parsed.data.email, ip);

  const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
  if (existente) {
    return NextResponse.json({ error: EMAIL_EN_USO }, { status: 409 });
  }

  // El registro público crea una empresa nueva. Su primer usuario nace ADMIN
  // y activo: no hay otro administrador dentro de esa empresa que pueda
  // activarlo, a diferencia de los cobradores que se dan de alta desde
  // /usuarios dentro de una empresa ya existente (esos sí nacen inactivos).
  let nuevo;
  try {
    nuevo = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nombre: parsed.data.empresaNombre } });
      const creado = await tx.usuario.create({
        data: {
          empresaId: empresa.id,
          nombre: parsed.data.nombre,
          email: parsed.data.email,
          password: await hashPassword(parsed.data.password),
          rol: "ADMIN",
          activo: true,
        },
      });
      await auditar("Usuario", "CREATE", empresa.id, creado.id, {
        registroId: creado.id,
        newValues: { ...creado, password: "***" },
      }, tx);
      await auditar("Empresa", "CREATE", empresa.id, creado.id, {
        registroId: empresa.id,
        newValues: empresa,
      }, tx);
      return creado;
    });
  } catch (error) {
    // Dos registros simultáneos con el mismo email: el segundo choca con el índice único.
    if (esDuplicado(error)) return NextResponse.json({ error: EMAIL_EN_USO }, { status: 409 });
    throw error;
  }

  await enviarCorreoBienvenida(nuevo.email, nuevo.nombre);

  return NextResponse.json({ success: true }, { status: 201 });
}

async function enviarCorreoBienvenida(email: string, nombre: string) {
  if (!process.env.BREVO_API_KEY) {
    console.error("[REGISTRO] BREVO_API_KEY no está configurada, se omite el correo de bienvenida");
    return;
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@prestosistema.com";
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/login`;

  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "PRESTO", email: senderEmail },
        to: [{ email }],
        subject: "¡Bienvenido a PRESTO!",
        htmlContent: `
<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background-color: #f9fafb;">
  <div style="background-color: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #eee;">
    <div style="text-align: center; margin-bottom: 8px;">
      <span style="font-size: 40px;">🏦</span>
    </div>
    <h2 style="color: #1a1a1a; text-align: center; margin-top: 0;">¡Bienvenido a PRESTO!</h2>
    <p style="color: #555; line-height: 1.5;">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
    <p style="color: #555; line-height: 1.5;">
      Gracias por registrarte en <strong>PRESTO</strong>. Tu cuenta ya está lista para que empieces
      a gestionar los préstamos de tu empresa de forma simple y ordenada.
    </p>
    <p style="color: #555; line-height: 1.5;">Con el sistema vas a poder gestionar:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 10px 0; color: #555;">👤 <strong>Clientes</strong> — alta y seguimiento de tus clientes</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #555;">💰 <strong>Préstamos</strong> — creación con cronograma de cuotas automático</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #555;">🧾 <strong>Pagos</strong> — registro de cobros por cuota</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #555;">📊 <strong>Reportes</strong> — cartera activa, morosidad y vencimientos</td>
      </tr>
    </table>
    <p style="color: #555; line-height: 1.5;">
      Cada pago registrado actualiza automáticamente el estado de las cuotas y préstamos, para que
      siempre tengas un control preciso de tu cartera.
    </p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${loginUrl}"
         style="display: inline-block; padding: 12px 28px;
                background-color: #16332a; color: white; text-decoration: none;
                border-radius: 8px; font-weight: bold;">
        Ingresar a PRESTO
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="color: #bbb; font-size: 12px; text-align: center;">
      PRESTO — Gestión de Préstamos
    </p>
  </div>
</div>`,
      }),
    });
  } catch (error) {
    console.error("[REGISTRO] Error al enviar correo de bienvenida:", error);
  }
}
