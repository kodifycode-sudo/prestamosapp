/** Tope por página cuando se pide paginación. */
const LIMITE_MAXIMO = 500;

/**
 * Paginación opcional por query string (`?limite=50&offset=100`). Sin `limite`
 * devuelve {} y el listado responde completo como siempre, así los clientes
 * existentes (app móvil) no cambian de comportamiento.
 */
export function leerPaginacion(params: URLSearchParams): { take?: number; skip?: number } {
  const limite = Number(params.get("limite"));
  if (!Number.isInteger(limite) || limite <= 0) return {};
  const offset = Number(params.get("offset"));
  return {
    take: Math.min(limite, LIMITE_MAXIMO),
    skip: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}
