import { formatFechaHora } from "@/lib/fechas";
import { createTable, type Table } from "@tanstack/react-table";

type ExportMeta = { label?: string; exportable?: boolean };

function formatValueForExport(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatFechaHora(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

/**
 * Misma tabla (columnas, visibilidad y orden elegidos) pero con otro conjunto de
 * filas: se usa cuando la pantalla muestra solo una parte y se exporta todo.
 */
function tablaConDatos<TData>(table: Table<TData>, data: TData[]): Table<TData> {
  return createTable<TData>({
    ...table.options,
    data,
    state: table.getState(),
    onStateChange: () => {},
  });
}

/**
 * Exporta las filas de la tabla a un .xlsx. Si se pasa `todasLasFilas`, se exportan
 * esas en lugar de las cargadas en pantalla.
 */
export async function exportTableToExcel<TData>(
  table: Table<TData>,
  filename: string,
  todasLasFilas?: TData[]
) {
  const XLSX = await import("xlsx");
  const origen = todasLasFilas ? tablaConDatos(table, todasLasFilas) : table;

  const columns = origen
    .getVisibleFlatColumns()
    .filter((column) => (column.columnDef.meta as ExportMeta | undefined)?.exportable !== false);

  const headers = columns.map(
    (column) => (column.columnDef.meta as ExportMeta | undefined)?.label ?? column.id
  );

  const rows = origen
    .getSortedRowModel()
    .rows.map((row) => columns.map((column) => formatValueForExport(row.getValue(column.id))));

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Datos");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
