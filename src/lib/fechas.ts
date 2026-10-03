/**
 * Manejo de fechas del negocio.
 *
 * Hay dos tipos de valores:
 * - Fechas de calendario (vencimientos, inicio de préstamo/simulación): representan
 *   un día, sin hora. Se guardan a las 00:00 UTC de ese día y se formatean/comparan
 *   en UTC, así se ven igual en el servidor (UTC en Vercel) y en el navegador.
 * - Instantes (fecha de pago, createdAt): un momento real. "Hoy", "este mes" y los
 *   rangos de fechas se cortan en la zona horaria del negocio.
 */

export const ZONA_HORARIA = "America/Asuncion";

const DIA_MS = 24 * 60 * 60 * 1000;

const partesFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_HORARIA,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partesEnZona(instante: Date) {
  const p = Object.fromEntries(
    partesFormatter.formatToParts(instante).map((x) => [x.type, Number(x.value)])
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
  return p;
}

/** Diferencia (ms) entre la hora local de la zona y UTC en ese instante (negativa al oeste). */
function offsetEnZona(instante: Date) {
  const p = partesEnZona(instante);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** Fecha de calendario (00:00 UTC) del día que es `instante` en la zona del negocio. */
export function fechaCalendarioDe(instante: Date): Date {
  const p = partesEnZona(instante);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** El día de hoy en la zona del negocio, como fecha de calendario. */
export function hoyCalendario(): Date {
  return fechaCalendarioDe(new Date());
}

export function sumarDias(fechaCalendario: Date, dias: number): Date {
  return new Date(fechaCalendario.getTime() + dias * DIA_MS);
}

export function inicioMesCalendario(fechaCalendario: Date): Date {
  return new Date(Date.UTC(fechaCalendario.getUTCFullYear(), fechaCalendario.getUTCMonth(), 1));
}

export function inicioMesSiguienteCalendario(fechaCalendario: Date): Date {
  return new Date(Date.UTC(fechaCalendario.getUTCFullYear(), fechaCalendario.getUTCMonth() + 1, 1));
}

/** Días de calendario entre dos fechas de calendario (b - a). */
export function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DIA_MS);
}

/** Instante en que empieza, en la zona del negocio, el día de esa fecha de calendario. */
export function inicioDelDia(fechaCalendario: Date): Date {
  // El offset se toma al mediodía para no caer en una transición de horario.
  const offset = offsetEnZona(new Date(fechaCalendario.getTime() + DIA_MS / 2));
  return new Date(fechaCalendario.getTime() - offset);
}

/** Rango [desde, hasta) de instantes que cubre los días de calendario indicados (ambos incluidos). */
export function rangoDeDias(desde: Date, hasta: Date): { gte: Date; lt: Date } {
  return { gte: inicioDelDia(desde), lt: inicioDelDia(sumarDias(hasta, 1)) };
}

/** "yyyy-MM-dd" → fecha de calendario. Devuelve null si el formato no es válido. */
export function parseFechaCalendario(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Clave "yyyy-MM-dd" de una fecha de calendario. */
export function claveFecha(fechaCalendario: Date | string): string {
  return new Date(fechaCalendario).toISOString().slice(0, 10);
}

/** dd/MM/yyyy de una fecha de calendario (vencimiento, inicio). */
export function formatFecha(fechaCalendario: Date | string): string {
  return new Date(fechaCalendario).toLocaleDateString("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Fecha y hora de un instante (pago, registro de auditoría), en la zona del negocio. */
export function formatFechaHora(instante: Date | string): string {
  return new Date(instante).toLocaleString("es-AR", { timeZone: ZONA_HORARIA });
}

/**
 * Filtro de instantes para un rango de días "yyyy-MM-dd" (ambos extremos incluidos,
 * cualquiera puede faltar). Devuelve undefined si no hay ningún extremo válido.
 */
export function filtroInstantesEntreDias(desde?: string | null, hasta?: string | null) {
  const d = desde ? parseFechaCalendario(desde) : null;
  const h = hasta ? parseFechaCalendario(hasta) : null;
  if (!d && !h) return undefined;
  return {
    ...(d ? { gte: inicioDelDia(d) } : {}),
    ...(h ? { lt: inicioDelDia(sumarDias(h, 1)) } : {}),
  };
}
