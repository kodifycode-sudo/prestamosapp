import prisma from "@/libs/prisma";
import { comparePassword, hashPassword } from "@/utils/hash";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ipDelCliente,
  limpiarIntentos,
  minutosDeEspera,
  registrarIntento,
  superaLimite,
} from "@/lib/limite-intentos";
import { normalizarEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().min(1).transform(normalizarEmail),
  password: z.string().min(1),
});

/** Mismo mensaje si el email no existe o la contraseña no coincide: no revela qué cuentas hay. */
const CREDENCIALES_INVALIDAS = "Email o contraseña incorrectos";

/**
 * Hash bcrypt de referencia: cuando el email no existe igual se compara contra él,
 * para que la respuesta tarde lo mismo y el tiempo tampoco delate qué cuentas existen.
 */
const hashReferencia = hashPassword(crypto.randomUUID());

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ingresá email y contraseña" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const ip = await ipDelCliente();

  if (await superaLimite("LOGIN", email, ip)) {
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos. Esperá ${minutosDeEspera("LOGIN")} minutos e intentá de nuevo.`,
      },
      { status: 429 }
    );
  }

  const user = await prisma.usuario.findUnique({ where: { email } });
  const isValid = await comparePassword(password, user?.password ?? (await hashReferencia));

  if (!user || !isValid) {
    await registrarIntento("LOGIN", email, ip);
    return NextResponse.json({ error: CREDENCIALES_INVALIDAS }, { status: 401 });
  }

  // Se informa solo después de validar la contraseña, para no revelar el estado de cuentas ajenas.
  if (!user.activo) {
    return NextResponse.json(
      { error: "Usuario inactivo. Comuníquese con el administrador." },
      { status: 403 }
    );
  }

  await limpiarIntentos("LOGIN", email);

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET no está definido en las variables de entorno.");
  }

  const token = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
      usuarioId: user.id,
      empresaId: user.empresaId,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      sv: user.sesionVersion,
    },
    process.env.JWT_SECRET
  );

  const cookieStore = await cookies();
  cookieStore.set("tokenPrestamos", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.json({
    success: true,
    token,
    user: {
      usuarioId: user.id,
      empresaId: user.empresaId,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    },
  });
}
