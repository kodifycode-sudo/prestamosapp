import { formatMonto } from "@/lib/format";

/** Máximo que entra en las columnas de importes (Decimal(12, 2)). */
export const MONTO_MAXIMO = 9_999_999_999;

/** Tope de cuotas por préstamo: cubre un préstamo diario de dos años. */
export const CUOTAS_MAXIMAS = 730;

export const MENSAJE_MONTO_MAXIMO = `No puede superar ${formatMonto(MONTO_MAXIMO)}`;
export const MENSAJE_CUOTAS_MAXIMAS = `No puede haber más de ${CUOTAS_MAXIMAS} cuotas`;
