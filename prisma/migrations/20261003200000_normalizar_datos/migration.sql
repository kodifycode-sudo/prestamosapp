-- ATRASADO ya no se guarda: se calcula a partir de las cuotas vencidas (lib/estado-prestamo).
UPDATE "Prestamo" SET "estado" = 'ACTIVO' WHERE "estado" = 'ATRASADO';

-- Los emails se guardan en minúsculas y sin espacios (lib/email). Si dos usuarios
-- difieren solo en mayúsculas, el índice único hace fallar la migración: hay que
-- resolver ese duplicado a mano antes de volver a aplicarla.
UPDATE "Usuario" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
UPDATE "PasswordResetToken" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
