export function toCountMap(rows: { value: string; count: number }[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.value] = row.count;
    return acc;
  }, {});
}

/**
 * Deja solo los valores válidos del enum: los filtros llegan de la URL y un valor
 * desconocido haría fallar la consulta (error 500) en lugar de no filtrar.
 */
export function valoresDeEnum<T extends string>(valores: string[] | undefined, enumerado: Record<string, T>): T[] {
  const permitidos = new Set<string>(Object.values(enumerado));
  return (valores ?? []).filter((v): v is T => permitidos.has(v));
}
