import { formatFechaHora } from "@/lib/fechas";
import type { Table } from "@tanstack/react-table";

type ExportMeta = { label?: string; exportable?: boolean };

function formatValueForExport(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatFechaHora(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

export async function exportTableToExcel<TData>(table: Table<TData>, filename: string) {
  const XLSX = await import("xlsx");

  const columns = table
    .getVisibleFlatColumns()
    .filter((column) => (column.columnDef.meta as ExportMeta | undefined)?.exportable !== false);

  const headers = columns.map(
    (column) => (column.columnDef.meta as ExportMeta | undefined)?.label ?? column.id
  );

  const rows = table
    .getSortedRowModel()
    .rows.map((row) => columns.map((column) => formatValueForExport(row.getValue(column.id))));

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Datos");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
