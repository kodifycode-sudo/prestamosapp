"use client";

import { useState } from "react";
import type { Table } from "@tanstack/react-table";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { exportTableToExcel } from "@/lib/export-excel";

export function DataTableExportButton<TData>({
  table,
  filename,
  obtenerTodos,
}: {
  table: Table<TData>;
  filename: string;
  /** Trae todas las filas a exportar cuando la tabla muestra solo una parte. */
  obtenerTodos?: () => Promise<TData[]>;
}) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      await exportTableToExcel(table, filename, obtenerTodos ? await obtenerTodos() : undefined);
    } catch {
      toast.error("No se pudo exportar a Excel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          aria-label="Exportar a Excel"
          disabled={loading}
          onClick={handleExport}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Exportar a Excel</TooltipContent>
    </Tooltip>
  );
}
