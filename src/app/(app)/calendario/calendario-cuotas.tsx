"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMonto } from "@/lib/format";
import { estadoCuotaVariant, getEstadoEfectivoCuota } from "@/lib/cuotas";
import { claveFecha, hoyCalendario } from "@/lib/fechas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Cuota = {
  id: string;
  numero: number;
  fechaVencimiento: string;
  montoTotal: string;
  montoPagado: string;
  estado: string;
  prestamoId: string;
  prestamo: { cliente: { id: string; nombre: string; apellido: string } };
};

const DIAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MAX_VISIBLE_POR_DIA = 2;

export function CalendarioCuotas({
  mesDeReferencia,
  cuotas,
}: {
  mesDeReferencia: string;
  cuotas: Cuota[];
}) {
  const router = useRouter();
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const hoy = hoyCalendario();
  // mesDeReferencia llega como "yyyy-MM"; se parsea en hora local (no UTC) para que la
  // navegación de meses sea correcta en Vercel (server UTC) igual que en local.
  const mesActual = useMemo(() => {
    const [year, month] = mesDeReferencia.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [mesDeReferencia]);

  const dias = useMemo(() => {
    const inicioMes = startOfMonth(mesActual);
    const finMes = endOfMonth(mesActual);
    const inicioGrilla = startOfWeek(inicioMes, { weekStartsOn: 1 });
    const finGrilla = endOfWeek(finMes, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: inicioGrilla, end: finGrilla });
  }, [mesActual]);

  const cuotasPorDia = useMemo(() => {
    const map = new Map<string, Cuota[]>();
    for (const cuota of cuotas) {
      const key = claveFecha(cuota.fechaVencimiento);
      const lista = map.get(key) ?? [];
      lista.push(cuota);
      map.set(key, lista);
    }
    return map;
  }, [cuotas]);

  function irAMes(fecha: Date) {
    const mes = format(fecha, "yyyy-MM");
    router.push(`/calendario?mes=${mes}`);
  }

  const cuotasDelDiaSeleccionado = diaSeleccionado ? cuotasPorDia.get(diaSeleccionado) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium capitalize">
          {format(mesActual, "MMMM yyyy", { locale: es })}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => irAMes(new Date())}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={() => irAMes(subMonths(mesActual, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => irAMes(addMonths(mesActual, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(["PENDIENTE", "PARCIAL", "ATRASADA", "PAGADA"] as const).map((estado) => (
          <span key={estado} className="flex items-center gap-1.5">
            <Badge variant={estadoCuotaVariant[estado]} className="h-2 w-2 rounded-full p-0" />
            {estado === "PENDIENTE" && "Pendiente"}
            {estado === "PARCIAL" && "Parcial"}
            {estado === "ATRASADA" && "Atrasada"}
            {estado === "PAGADA" && "Pagada"}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia} className="p-2">
                {dia}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((dia) => {
              const key = format(dia, "yyyy-MM-dd");
              const cuotasDelDia = cuotasPorDia.get(key) ?? [];
              const enMesActual = isSameMonth(dia, mesActual);
              const visibles = cuotasDelDia.slice(0, MAX_VISIBLE_POR_DIA);
              const restantes = cuotasDelDia.length - visibles.length;

              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-28 border-b border-r p-1.5 last:border-r-0",
                    !enMesActual && "bg-muted/20"
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex size-6 items-center justify-center rounded-full text-xs",
                      isToday(dia) && "bg-primary font-semibold text-primary-foreground",
                      !enMesActual && "text-muted-foreground"
                    )}
                  >
                    {format(dia, "d")}
                  </div>
                  <div className="space-y-1">
                    {visibles.map((cuota) => {
                      const efectivo = getEstadoEfectivoCuota(
                        cuota.estado,
                        new Date(cuota.fechaVencimiento),
                        hoy
                      );
                      const pendiente = Number(cuota.montoTotal) - Number(cuota.montoPagado);
                      return (
                        <Link
                          key={cuota.id}
                          href={`/prestamos/${cuota.prestamoId}`}
                          className="block truncate rounded px-1 py-0.5 text-[11px] leading-tight hover:underline"
                          style={badgeStyle(efectivo)}
                          title={`${cuota.prestamo.cliente.nombre} ${cuota.prestamo.cliente.apellido} · ${formatMonto(pendiente)}`}
                        >
                          {cuota.prestamo.cliente.apellido} · {formatMonto(pendiente)}
                        </Link>
                      );
                    })}
                    {restantes > 0 && (
                      <button
                        type="button"
                        onClick={() => setDiaSeleccionado(key)}
                        className="block w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-muted-foreground hover:underline"
                      >
                        +{restantes} más
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(diaSeleccionado)} onOpenChange={(open) => !open && setDiaSeleccionado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cuotas del {diaSeleccionado && format(new Date(`${diaSeleccionado}T00:00:00`), "dd/MM/yyyy")}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {cuotasDelDiaSeleccionado.map((cuota) => {
              const efectivo = getEstadoEfectivoCuota(
                cuota.estado,
                new Date(cuota.fechaVencimiento),
                hoy
              );
              const pendiente = Number(cuota.montoTotal) - Number(cuota.montoPagado);
              return (
                <Link
                  key={cuota.id}
                  href={`/prestamos/${cuota.prestamoId}`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                >
                  <span>
                    {cuota.prestamo.cliente.nombre} {cuota.prestamo.cliente.apellido} · Cuota #{cuota.numero}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatMonto(pendiente)}
                    <Badge variant={estadoCuotaVariant[efectivo]}>{efectivo}</Badge>
                  </span>
                </Link>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function badgeStyle(estado: ReturnType<typeof getEstadoEfectivoCuota>) {
  switch (estado) {
    case "PAGADA":
      return { backgroundColor: "hsl(var(--primary) / 0.12)", color: "hsl(var(--primary))" };
    case "ATRASADA":
      return { backgroundColor: "hsl(var(--destructive) / 0.12)", color: "hsl(var(--destructive))" };
    case "PARCIAL":
      return { backgroundColor: "hsl(var(--secondary))", color: "hsl(var(--secondary-foreground))" };
    default:
      return { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" };
  }
}
