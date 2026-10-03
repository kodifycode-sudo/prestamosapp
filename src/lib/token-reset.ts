import crypto from "crypto";

/**
 * En la base se guarda solo el hash del token de restablecimiento: quien lea la
 * tabla no puede usar los enlaces vigentes. El token en claro viaja solo en el correo.
 */
export function hashTokenReset(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
