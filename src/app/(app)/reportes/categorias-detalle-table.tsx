"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { formatMonto } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FacetedFilter } from "@/components/faceted-filter";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbarActions } from "@/components/data-table/data-table-toolbar-actions";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";

const SIN_CATEGORIA = "SIN_CATEGORIA";

type PrestamoDetalle = {
  id: string;
  monto: string;
  interes: string | null;
  totalAPagar: number;
  saldoPendiente: number;
  estado: string;
  estadoEfectivo: string;
  frecuencia: string;
  cantidadCuotas: number;
  cliente: { id: string; nombre: string; apellido: string };
  fuenteIngreso: { id: string; nombre: string } | null;
};

const estadoVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVO: "default",
  PAGADO: "secondary",
  ATRASADO: "destructive",
  CANCELADO: "outline",
  REFINANCIADO: "outline",
  ANULADO: "outline",
};

const estadoOptions = [
  { label: "Activo", value: "ACTIVO" },
  { label: "Pagado", value: "PAGADO" },
  { label: "Atrasado", value: "ATRASADO" },
  { label: "Cancelado", value: "CANCELADO" },
  { label: "Refinanciado", value: "REFINANCIADO" },
  { label: "Anulado", value: "ANULADO" },
];

function withCounts(options: { label: string; value: string }[], counts: Record<string, number>) {
  return options.map((option) => ({ ...option, count: counts[option.value] ?? 0 }));
}

function countBy<T extends string>(items: T[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) map[item] = (map[item] ?? 0) + 1;
  return map;
}

const columns: ColumnDef<PrestamoDetalle>[] = [
  {
    id: "cliente",
    accessorFn: (row) => `${row.cliente.nombre} ${row.cliente.apellido}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
    cell: ({ row }) => (
      <Link href={`/clientes/${row.original.cliente.id}`} className="font-medium hover:underline">
        {row.original.cliente.nombre} {row.original.cliente.apellido}
      </Link>
    ),
    meta: { label: "Cliente" },
  },
  {
    id: "fuenteIngreso",
    accessorFn: (row) => row.fuenteIngreso?.nombre ?? "Sin categorizar",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fuente de ingreso" />,
    cell: ({ row }) =>
      row.original.fuenteIngreso ? (
        <Badge variant="outline">{row.original.fuenteIngreso.nombre}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    meta: { label: "Fuente de ingreso" },
  },
  {
    id: "monto",
    accessorFn: (row) => Number(row.monto),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Monto" />,
    cell: ({ row }) => formatMonto(row.original.monto),
    meta: { label: "Monto" },
  },
  {
    id: "interes",
    accessorFn: (row) => (row.interes !== null ? Number(row.interes) : 0),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Interés" />,
    cell: ({ row }) => (row.original.interes !== null ? formatMonto(row.original.interes) : "—"),
    meta: { label: "Interés" },
  },
  {
    id: "total",
    accessorFn: (row) => row.totalAPagar,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
    cell: ({ row }) => formatMonto(row.original.totalAPagar),
    meta: { label: "Total" },
  },
  {
    id: "saldo",
    accessorFn: (row) => row.saldoPendiente,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Saldo" />,
    cell: ({ row }) => formatMonto(row.original.saldoPendiente),
    meta: { label: "Saldo" },
  },
  {
    id: "frecuencia",
    accessorFn: (row) => row.frecuencia,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Frecuencia" />,
    meta: { label: "Frecuencia" },
  },
  {
    id: "estado",
    accessorFn: (row) => row.estadoEfectivo,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
    cell: ({ row }) => (
      <Badge variant={estadoVariant[row.original.estadoEfectivo]}>{row.original.estadoEfectivo}</Badge>
    ),
    meta: { label: "Estado" },
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="text-right">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" asChild>
              <Link href={`/prestamos/${row.original.id}`} aria-label="Ver préstamo">
                <Eye className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver préstamo</TooltipContent>
        </Tooltip>
      </div>
    ),
    meta: { exportable: false },
  },
];

export function CategoriasDetalleTable({
  prestamos,
  fuentesIngreso,
}: {
  prestamos: PrestamoDetalle[];
  fuentesIngreso: { id: string; nombre: string }[];
}) {
  const [estadoFiltro, setEstadoFiltro] = useState<string[]>([]);
  const [fuenteFiltro, setFuenteFiltro] = useState<string[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const fuenteOptions = useMemo(
    () => [
      ...fuentesIngreso.map((f) => ({ label: f.nombre, value: f.id })),
      { label: "Sin categorizar", value: SIN_CATEGORIA },
    ],
    [fuentesIngreso]
  );

  const estadoCounts = useMemo(() => countBy(prestamos.map((p) => p.estadoEfectivo)), [prestamos]);
  const fuenteCounts = useMemo(
    () => countBy(prestamos.map((p) => p.fuenteIngreso?.id ?? SIN_CATEGORIA)),
    [prestamos]
  );

  const data = useMemo(() => {
    return prestamos.filter((p) => {
      if (estadoFiltro.length && !estadoFiltro.includes(p.estadoEfectivo)) return false;
      if (fuenteFiltro.length) {
        const key = p.fuenteIngreso?.id ?? SIN_CATEGORIA;
        if (!fuenteFiltro.includes(key)) return false;
      }
      return true;
    });
  }, [prestamos, estadoFiltro, fuenteFiltro]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, pagination },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const hasFilters = estadoFiltro.length > 0 || fuenteFiltro.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FacetedFilter
            title="Estado"
            options={withCounts(estadoOptions, estadoCounts)}
            selected={estadoFiltro}
            onChange={setEstadoFiltro}
          />
          <FacetedFilter
            title="Fuente de ingreso"
            options={withCounts(fuenteOptions, fuenteCounts)}
            selected={fuenteFiltro}
            onChange={setFuenteFiltro}
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEstadoFiltro([]);
                setFuenteFiltro([]);
              }}
            >
              Limpiar
            </Button>
          )}
        </div>
        <DataTableToolbarActions table={table} filename="prestamos-por-categoria" />
      </div>

      <DataTable table={table} emptyMessage="No hay préstamos que coincidan con los filtros." />
      <DataTablePagination table={table} />
    </div>
  );
}
