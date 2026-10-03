import { z } from "zod";

/**
 * Regla única para contraseñas nuevas (registro, alta/edición de usuarios y
 * restablecimiento). No se aplica al login: las contraseñas existentes siguen sirviendo.
 */
export const passwordSchema = z
  .string()
  .min(7, "La contraseña debe tener más de 6 caracteres")
  .regex(/[A-Z]/, "La contraseña debe tener al menos una letra mayúscula");
