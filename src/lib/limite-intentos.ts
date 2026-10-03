import { headers } from "next/headers";
import prisma from "@/libs/prisma";

export type TipoIntento = "LOGIN" | "RESET" | "REGISTRO";

const MINUTO_MS = 60 * 1000;

/**
 * Cantidad máxima de intentos por email y por IP dentro de la ventana. El límite
 * por IP es más alto porque varios cobradores pueden salir por la misma conexión.
 */
const REGLAS: Record<TipoIntento, { ventanaMs: number; porEmail: number; porIp: number }> = {
  LOGIN: { ventanaMs: 15 * MINUTO_MS, porEmail: 5, porIp: 30 },
  RESET: { ventanaMs: 60 * MINUTO_MS, porEmail: 3, porIp: 10 },
  REGISTRO: { ventanaMs: 60 * MINUTO_MS, porEmail: 3, porIp: 5 },
};

/** Los registros más viejos que esto ya no cuentan para ninguna regla. */
const RETENCION_MS = 24 * 60 * MINUTO_MS;

export function minutosDeEspera(tipo: TipoIntento) {
  return REGLAS[tipo].ventanaMs / MINUTO_MS;
}

/** IP del cliente; en Vercel la primera de x-forwarded-for es la del visitante. */
export async function ipDelCliente(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "desconocida";
}

const claveEmail = (email: string) => `email:${email.trim().toLowerCase()}`;
const claveIp = (ip: string) => `ip:${ip}`;

export async function superaLimite(tipo: TipoIntento, email: string, ip: string) {
  const regla = REGLAS[tipo];
  const desde = new Date(Date.now() - regla.ventanaMs);
  const [porEmail, porIp] = await Promise.all([
    prisma.intentoAcceso.count({ where: { tipo, clave: claveEmail(email), createdAt: { gte: desde } } }),
    prisma.intentoAcceso.count({ where: { tipo, clave: claveIp(ip), createdAt: { gte: desde } } }),
  ]);
  return porEmail >= regla.porEmail || porIp >= regla.porIp;
}

export async function registrarIntento(tipo: TipoIntento, email: string, ip: string) {
  await prisma.intentoAcceso.createMany({
    data: [
      { tipo, clave: claveEmail(email) },
      { tipo, clave: claveIp(ip) },
    ],
  });
  await prisma.intentoAcceso.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - RETENCION_MS) } },
  });
}

/** Tras un login correcto se perdonan los fallos previos de ese email. */
export async function limpiarIntentos(tipo: TipoIntento, email: string) {
  await prisma.intentoAcceso.deleteMany({ where: { tipo, clave: claveEmail(email) } });
}
