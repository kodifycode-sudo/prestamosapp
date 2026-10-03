import { z } from "zod";

/**
 * Los emails se guardan y se buscan siempre en minúsculas y sin espacios: así
 * "Ana@x.com" y "ana@x.com" son la misma cuenta al registrarse y al ingresar.
 */
export function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

export const emailSchema = z.string().trim().toLowerCase().email("Email inválido");
