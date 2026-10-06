"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Eye, Plus, Search, X } from "lucide-react";
import { formatMonto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FacetedFilter } from "@/components/faceted-filter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbarActions } from "@/components/data-table/data-table-toolbar-actions";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";

type Prestamo = {
  id: string;
  monto: string;
  interes: string | null;
  cantidadCuotas: number;
  tipoInteres: string | null;
  frecuencia: string;
  estado: string;
  /** Estado a mostrar: ACTIVO con cuotas vencidas se ve como ATRASADO. */
  estadoEfectivo: string;
  totalAPagar: number;
  saldoPendiente: number;
  cuotasPagadas: number;
  cuotasPendientes: number;
  cliente: { id: string; nombre: string; apellido: string };
  fuenteIngreso: { id: string; nombre: string } | null;
};

type FacetCounts = {
  estado: Record<string, number>;
  tipoInteres: Record<string, number>;
  frecuencia: Record<string, number>;
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

const tipoOptions = [
  { label: "Francés", value: "FRANCES" },
  { label: "Alemán", value: "ALEMAN" },
  { label: "Simple", value: "SIMPLE" },
];

const frecuenciaOptions = [
  { label: "Diaria", value: "DIARIA" },
  { label: "Semanal", value: "SEMANAL" },
  { label: "Quincenal", value: "QUINCENAL" },
  { label: "Mensual", value: "MENSUAL" },
];

function withCounts(options: { label: string; value: string }[], counts: Record<string, number>) {
  return options.map((option) => ({ ...option, count: counts[option.value] ?? 0 }));
}

const columns: ColumnDef<Prestamo>[] = [
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
    id: "monto",
    accessorFn: (row) => Number(row.monto),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Monto" />,
    cell: ({ row }) => formatMonto(row.original.monto),
    meta: { label: "Monto" },
  },
  {
    id: "cuotas",
    accessorFn: (row) => row.cantidadCuotas,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cuotas" />,
    meta: { label: "Cuotas" },
  },
  {
    id: "tipo",
    accessorFn: (row) => (row.interes !== null ? Number(row.interes) : row.tipoInteres),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Interés" />,
    cell: ({ row }) =>
      row.original.interes !== null ? formatMonto(row.original.interes) : row.original.tipoInteres,
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
    id: "cuotasPagadas",
    accessorFn: (row) => row.cuotasPagadas,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cuotas pagadas" />,
    meta: { label: "Cuotas pagadas" },
  },
  {
    id: "cuotasPendientes",
    accessorFn: (row) => row.cuotasPendientes,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cuotas pendientes" />,
    meta: { label: "Cuotas pendientes" },
  },
  {
    id: "frecuencia",
    accessorFn: (row) => row.frecuencia,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Frecuencia" />,
    meta: { label: "Frecuencia" },
  },
  {
    id: "fuenteIngreso",
    accessorFn: (row) => row.fuenteIngreso?.nombre ?? "",
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

export function PrestamosTable({
  initialData,
  facetCounts,
  initialFilters,
}: {
  initialData: Prestamo[];
  facetCounts: FacetCounts;
  initialFilters: { estado: string[]; tipo: string[]; frecuencia: string[]; q: string };
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialFilters.q);
  const [isPending, startTransition] = useTransition();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  // Lee la URL real al momento de ejecutarse (no un valor de searchParams capturado
  // por closure), para que un debounce de búsqueda que dispara tarde no pise un
  // cambio de filtro más reciente (p. ej. "Limpiar" hecho mientras se tipeaba).
  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    startTransition(() => {
      router.push(`/prestamos?${params.toString()}`);
    });
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      updateParams((params) => {
        if (query) params.set("q", query);
        else params.delete("q");
      });
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function setFacet(key: "estado" | "tipo" | "frecuencia", values: string[]) {
    updateParams((params) => {
      if (values.length) params.set(key, values.join(","));
      else params.delete(key);
    });
  }

  const hasFilters =
    initialFilters.estado.length > 0 ||
    initialFilters.tipo.length > 0 ||
    initialFilters.frecuencia.length > 0 ||
    Boolean(initialFilters.q);

  function clearFilters() {
    setQuery("");
    router.push("/prestamos");
  }

  const data = useMemo(() => initialData, [initialData]);

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [data]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <FacetedFilter
            title="Estado"
            options={withCounts(estadoOptions, facetCounts.estado)}
            selected={initialFilters.estado}
            onChange={(values) => setFacet("estado", values)}
          />
          <FacetedFilter
            title="Tipo de interés"
            options={withCounts(tipoOptions, facetCounts.tipoInteres)}
            selected={initialFilters.tipo}
            onChange={(values) => setFacet("tipo", values)}
          />
          <FacetedFilter
            title="Frecuencia"
            options={withCounts(frecuenciaOptions, facetCounts.frecuencia)}
            selected={initialFilters.frecuencia}
            onChange={(values) => setFacet("frecuencia", values)}
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar
              <X className="size-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DataTableToolbarActions table={table} filename="prestamos" />
          <Button asChild>
            <Link href="/prestamos/nuevo">
              <Plus className="size-4" />
              Nuevo préstamo
            </Link>
          </Button>
        </div>
      </div>

      <DataTable
        table={table}
        emptyMessage={isPending ? "Buscando..." : "No hay préstamos que coincidan con los filtros."}
      />
      <DataTablePagination table={table} />
    </div>
  );
}
