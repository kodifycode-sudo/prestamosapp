"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CUOTAS_MAXIMAS, MENSAJE_CUOTAS_MAXIMAS, MENSAJE_MONTO_MAXIMO, MONTO_MAXIMO } from "@/lib/limites";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { generarCuotas } from "@/lib/prestamos";
import { formatMonto, formatMontoInput, soloDigitos } from "@/lib/format";

type PrestamoRefinanciable = {
  id: string;
  clienteNombre: string;
  saldoPendiente: number;
  interes: number;
  frecuencia: "DIARIA" | "SEMANAL" | "QUINCENAL" | "MENSUAL";
};

const refinanciacionSchema = z.object({
  prestamoId: z.string().min(1, "Seleccioná un préstamo"),
  montoAdicional: z.coerce.number().min(0, "No puede ser negativo").max(MONTO_MAXIMO, MENSAJE_MONTO_MAXIMO).transform(Math.round),
  interes: z.coerce.number().min(0, "El interés no puede ser negativo").max(MONTO_MAXIMO, MENSAJE_MONTO_MAXIMO).transform(Math.round),
  cantidadCuotas: z.coerce.number().int().min(1, "Debe haber al menos 1 cuota").max(CUOTAS_MAXIMAS, MENSAJE_CUOTAS_MAXIMAS),
  frecuencia: z.enum(["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"]),
  fechaInicio: z.string().min(1, "Obligatorio"),
  observacion: z.string().optional(),
});

type RefinanciacionValues = z.input<typeof refinanciacionSchema>;
type RefinanciacionOutput = z.output<typeof refinanciacionSchema>;

export function RefinanciacionForm({
  prestamos,
  defaultPrestamoId,
}: {
  prestamos: PrestamoRefinanciable[];
  defaultPrestamoId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [prestamoOpen, setPrestamoOpen] = useState(false);

  const inicial = prestamos.find((p) => p.id === defaultPrestamoId) ?? prestamos[0];

  const form = useForm<RefinanciacionValues, unknown, RefinanciacionOutput>({
    resolver: zodResolver(refinanciacionSchema),
    defaultValues: {
      prestamoId: inicial?.id ?? "",
      montoAdicional: 0,
      interes: inicial?.interes ?? 0,
      cantidadCuotas: 6,
      frecuencia: inicial?.frecuencia ?? "MENSUAL",
      fechaInicio: format(new Date(), "yyyy-MM-dd"),
      observacion: "",
    },
  });

  const values = form.watch();
  const prestamoSeleccionado = prestamos.find((p) => p.id === values.prestamoId);

  function handlePrestamoChange(prestamoId: string) {
    form.setValue("prestamoId", prestamoId, { shouldValidate: true });
    const prestamo = prestamos.find((p) => p.id === prestamoId);
    if (prestamo) {
      form.setValue("interes", prestamo.interes);
      form.setValue("frecuencia", prestamo.frecuencia);
    }
  }

  const montoNuevo = (prestamoSeleccionado?.saldoPendiente ?? 0) + (Number(values.montoAdicional) || 0);

  const simulacion = useMemo(() => {
    if (!prestamoSeleccionado || !values.cantidadCuotas || !values.fechaInicio) return [];
    if (Number(values.cantidadCuotas) > CUOTAS_MAXIMAS) return [];
    try {
      return generarCuotas({
        monto: montoNuevo,
        interes: Number(values.interes) || 0,
        cantidadCuotas: Number(values.cantidadCuotas),
        frecuencia: values.frecuencia,
        fechaInicio: new Date(`${values.fechaInicio}T00:00:00`),
      });
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoNuevo, values.interes, values.cantidadCuotas, values.frecuencia, values.fechaInicio]);

  const totalCuotas = simulacion.reduce((s, c) => s + c.montoTotal, 0);

  async function onSubmit(data: RefinanciacionOutput) {
    setLoading(true);
    try {
      const { prestamoId, ...body } = data;
      const res = await fetch(`/api/prestamos/${prestamoId}/refinanciar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();

      if (!res.ok) {
        toast.error(typeof result.error === "string" ? result.error : "No se pudo refinanciar el préstamo");
        return;
      }

      toast.success("Préstamo refinanciado");
      router.push(`/prestamos/${result.id}`);
      router.refresh();
    } catch {
      toast.error("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  if (prestamos.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No hay préstamos activos con saldo pendiente para refinanciar.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="prestamoId"
            render={({ field }) => {
              const seleccionado = prestamos.find((p) => p.id === field.value);
              return (
                <FormItem className="flex flex-col">
                  <FormLabel>Préstamo a refinanciar</FormLabel>
                  <Popover open={prestamoOpen} onOpenChange={setPrestamoOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={prestamoOpen}
                          className={cn(
                            "w-full justify-between font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {seleccionado
                            ? `${seleccionado.clienteNombre} — saldo ${formatMonto(seleccionado.saldoPendiente)}`
                            : "Seleccioná un préstamo"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command
                        filter={(value, search) =>
                          value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
                        }
                      >
                        <CommandInput placeholder="Buscar por nombre de cliente..." />
                        <CommandList>
                          <CommandEmpty>No se encontró ningún préstamo.</CommandEmpty>
                          <CommandGroup>
                            {prestamos.map((prestamo) => (
                              <CommandItem
                                key={prestamo.id}
                                value={`${prestamo.clienteNombre} ${formatMonto(prestamo.saldoPendiente)}`}
                                onSelect={() => {
                                  handlePrestamoChange(prestamo.id);
                                  setPrestamoOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    prestamo.id === field.value ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {prestamo.clienteNombre} — saldo {formatMonto(prestamo.saldoPendiente)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {prestamoSeleccionado && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              Saldo pendiente a refinanciar:{" "}
              <span className="font-medium">{formatMonto(prestamoSeleccionado.saldoPendiente)}</span>
            </div>
          )}

          <FormField
            control={form.control}
            name="montoAdicional"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monto adicional a entregar (opcional)</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formatMontoInput(field.value)}
                    onChange={(e) => field.onChange(soloDigitos(e.target.value))}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="interes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interés</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={formatMontoInput(field.value)}
                      onChange={(e) => field.onChange(soloDigitos(e.target.value))}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cantidadCuotas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de cuotas</FormLabel>
                  <FormControl>
                    <Input type="number" step="1" min="1" {...field} value={field.value as number} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="frecuencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frecuencia</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="DIARIA">Diaria</SelectItem>
                      <SelectItem value="SEMANAL">Semanal</SelectItem>
                      <SelectItem value="QUINCENAL">Quincenal</SelectItem>
                      <SelectItem value="MENSUAL">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="fechaInicio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de inicio del nuevo préstamo</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="observacion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observación (opcional)</FormLabel>
                <FormControl>
                  <Textarea {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Refinanciando..." : "Confirmar refinanciación"}
          </Button>
        </form>
      </Form>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">Nuevo préstamo</h2>
          <p className="mb-3 text-lg font-semibold">{formatMonto(montoNuevo)}</p>
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Capital</TableHead>
                  <TableHead>Interés</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {simulacion.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Seleccioná un préstamo para ver el cronograma.
                    </TableCell>
                  </TableRow>
                )}
                {simulacion.map((cuota) => (
                  <TableRow key={cuota.numero}>
                    <TableCell>{cuota.numero}</TableCell>
                    <TableCell>{format(cuota.fechaVencimiento, "dd/MM/yyyy")}</TableCell>
                    <TableCell>{formatMonto(cuota.montoCapital)}</TableCell>
                    <TableCell>{formatMonto(cuota.montoInteres)}</TableCell>
                    <TableCell>{formatMonto(cuota.montoTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {simulacion.length > 0 && (
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p>
                Total a pagar: <span className="font-medium text-foreground">{formatMonto(totalCuotas)}</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
