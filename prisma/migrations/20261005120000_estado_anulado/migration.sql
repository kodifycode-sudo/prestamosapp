-- ANULADO: préstamo mal cargado y dado de baja sin pagos. No suma al desembolso ni a la cartera.
-- CANCELADO pasa a significar "saldado de una vez" (todas las cuotas pagadas juntas).
ALTER TYPE "EstadoPrestamo" ADD VALUE 'ANULADO';
