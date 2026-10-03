"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
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
import { Search, X } from "lucide-react";
import { formatMonto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FacetedFilter } from "@/components/faceted-filter";
import { DateRangeFilter, type DateRange } from "@/components/date-range-filter";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbarActions } from "@/components/data-table/data-table-toolbar-actions";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";

type Pago = {
  id: string;
  prestamoId: string;
  fechaPago: string;
  monto: string;
  metodoPago: string;
  observacion: string | null;
  prestamo: { cliente: { id: string; nombre: string; apellido: string } };
  cuota: { numero: number };
};

type FacetCounts = {
  metodoPago: Record<string, number>;
  cobradores: { label: string; value: string; count: number }[];
};

const metodoOptions = [
  { label: "Efectivo", value: "EFECTIVO" },
  { label: "Transferencia", value: "TRANSFERENCIA" },
  { label: "Otro", value: "OTRO" },
];

function withCounts(options: { label: string; value: string }[], counts: Record<string, number>) {
  return options.map((option) => ({ ...option, count: counts[option.value] ?? 0 }));
}

const columns: ColumnDef<Pago>[] = [
  {
    id: "fecha",
    accessorFn: (row) => new Date(row.fechaPago),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
    cell: ({ row }) => new Date(row.original.fechaPago).toLocaleString("es-AR"),
    meta: { label: "Fecha" },
  },
  {
    id: "cliente",
    accessorFn: (row) => `${row.prestamo.cliente.nombre} ${row.prestamo.cliente.apellido}`,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cliente" />,
    cell: ({ row }) => (
      <Link href={`/clientes/${row.original.prestamo.cliente.id}`} className="hover:underline">
        {row.original.prestamo.cliente.nombre} {row.original.prestamo.cliente.apellido}
      </Link>
    ),
    meta: { label: "Cliente" },
  },
  {
    id: "cuota",
    accessorFn: (row) => row.cuota.numero,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cuota" />,
    cell: ({ row }) => (
      <Link href={`/prestamos/${row.original.prestamoId}`} className="hover:underline">
        #{row.original.cuota.numero}
      </Link>
    ),
    meta: { label: "Cuota" },
  },
  {
    id: "monto",
    accessorFn: (row) => Number(row.monto),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Monto" />,
    cell: ({ row }) => formatMonto(row.original.monto),
    meta: { label: "Monto" },
  },
  {
    id: "metodo",
    accessorFn: (row) => row.metodoPago,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Método" />,
    meta: { label: "Método" },
  },
  {
    id: "observacion",
    accessorFn: (row) => row.observacion ?? "",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Observación" />,
    cell: ({ row }) => (
      <span className="block max-w-64 truncate">{row.original.observacion || "—"}</span>
    ),
    meta: { label: "Observación" },
  },
];

export function PagosTable({
  initialData,
  facetCounts,
  isAdmin,
  initialFilters,
}: {
  initialData: Pago[];
  facetCounts: FacetCounts;
  isAdmin: boolean;
  initialFilters: { metodo: string[]; cobrador: string[]; desde: string; hasta: string; q: string };
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialFilters.q);
  const [isPending, startTransition] = useTransition();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const dateRange: DateRange | undefined = initialFilters.desde
    ? {
        from: new Date(`${initialFilters.desde}T00:00:00`),
        to: initialFilters.hasta ? new Date(`${initialFilters.hasta}T00:00:00`) : undefined,
      }
    : undefined;

  // La tabla muestra los pagos más recientes; el Excel incluye todos los que
  // cumplen los filtros actuales de la URL.
  async function obtenerTodosLosPagos(): Promise<Pago[]> {
    const res = await fetch(`/api/pagos/exportar${window.location.search}`);
    if (!res.ok) throw new Error("No se pudieron obtener los pagos");
    return res.json();
  }

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    startTransition(() => {
      router.push(`/pagos?${params.toString()}`);
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

  function setFacet(key: "metodo" | "cobrador", values: string[]) {
    updateParams((params) => {
      if (values.length) params.set(key, values.join(","));
      else params.delete(key);
    });
  }

  function setDateRange(range: DateRange | undefined) {
    updateParams((params) => {
      if (range?.from) params.set("desde", format(range.from, "yyyy-MM-dd"));
      else params.delete("desde");
      if (range?.to) params.set("hasta", format(range.to, "yyyy-MM-dd"));
      else params.delete("hasta");
    });
  }

  const hasFilters =
    initialFilters.metodo.length > 0 ||
    initialFilters.cobrador.length > 0 ||
    Boolean(initialFilters.desde) ||
    Boolean(initialFilters.q);

  function clearFilters() {
    setQuery("");
    router.push("/pagos");
  }

  const data = useMemo(() => initialData, [initialData]);

  const resumen = useMemo(() => {
    const porMetodo: Record<string, number> = { EFECTIVO: 0, TRANSFERENCIA: 0, OTRO: 0 };
    let total = 0;
    for (const p of data) {
      const monto = Number(p.monto);
      total += monto;
      porMetodo[p.metodoPago] = (porMetodo[p.metodoPago] ?? 0) + monto;
    }
    return { total, cantidad: data.length, porMetodo };
  }, [data]);

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
      <div className="flex flex-wrap items-center justify-between gap-2">
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
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <FacetedFilter
            title="Método de pago"
            options={withCounts(metodoOptions, facetCounts.metodoPago)}
            selected={initialFilters.metodo}
            onChange={(values) => setFacet("metodo", values)}
          />
          {isAdmin && facetCounts.cobradores.length > 0 && (
            <FacetedFilter
              title="Cobrador"
              options={facetCounts.cobradores}
              selected={initialFilters.cobrador}
              onChange={(values) => setFacet("cobrador", values)}
            />
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Limpiar
              <X className="size-4" />
            </Button>
          )}
        </div>
        <DataTableToolbarActions table={table} filename="pagos" obtenerTodos={obtenerTodosLosPagos} />
      </div>

      <div className="rounded-md border bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Cierre del día</h2>
          <span className="text-xs text-muted-foreground">
            Totaliza los pagos según los filtros aplicados{initialFilters.desde ? "" : " (usá el filtro de fecha para acotar al día)"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Total cobrado</p>
            <p className="text-lg font-semibold">{formatMonto(resumen.total)}</p>
            <p className="text-xs text-muted-foreground">{resumen.cantidad} pago(s)</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Efectivo</p>
            <p className="text-lg font-semibold">{formatMonto(resumen.porMetodo.EFECTIVO)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Transferencia</p>
            <p className="text-lg font-semibold">{formatMonto(resumen.porMetodo.TRANSFERENCIA)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Otro</p>
            <p className="text-lg font-semibold">{formatMonto(resumen.porMetodo.OTRO)}</p>
          </div>
        </div>
      </div>

      <DataTable
        table={table}
        emptyMessage={isPending ? "Buscando..." : "No hay pagos que coincidan con los filtros."}
      />
      <DataTablePagination table={table} />
    </div>
  );
}
