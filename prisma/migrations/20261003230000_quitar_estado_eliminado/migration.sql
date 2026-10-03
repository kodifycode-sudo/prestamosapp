-- Quita el valor ELIMINADO de EstadoPrestamo, agregado directo en la base por la
-- migración 20261002000000_add_estado_eliminado, que no pertenece al proyecto.
-- Ningún préstamo lo usa: el cast falla (y la transacción se revierte) si alguno lo tuviera.
BEGIN;
CREATE TYPE "EstadoPrestamo_new" AS ENUM ('ACTIVO', 'PAGADO', 'ATRASADO', 'CANCELADO', 'REFINANCIADO');
ALTER TABLE "Prestamo" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "Prestamo" ALTER COLUMN "estado" TYPE "EstadoPrestamo_new" USING ("estado"::text::"EstadoPrestamo_new");
ALTER TYPE "EstadoPrestamo" RENAME TO "EstadoPrestamo_old";
ALTER TYPE "EstadoPrestamo_new" RENAME TO "EstadoPrestamo";
DROP TYPE "EstadoPrestamo_old";
ALTER TABLE "Prestamo" ALTER COLUMN "estado" SET DEFAULT 'ACTIVO';
COMMIT;
