-- Hasta ahora "cancelar" era dar de baja un préstamo sin pagos: eso es lo que hoy se llama anular.
-- Va en su propia migración porque Postgres no deja usar un valor de enum en la misma
-- transacción que lo agrega.
UPDATE "Prestamo" SET "estado" = 'ANULADO' WHERE "estado" = 'CANCELADO';
