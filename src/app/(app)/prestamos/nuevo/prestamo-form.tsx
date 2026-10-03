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
import { DatePickerField } from "@/components/date-picker-field";
import { generarCuotas } from "@/lib/prestamos";
import { formatMonto, formatMontoInput, soloDigitos } from "@/lib/format";

const SIN_FUENTE = "SIN_FUENTE";

const prestamoSchema = z.object({
  clienteId: z.string().min(1, "Seleccioná un cliente"),
  fuenteIngresoId: z.string().optional(),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0").max(MONTO_MAXIMO, MENSAJE_MONTO_MAXIMO).transform(Math.round),
  interes: z.coerce.number().min(0, "El interés no puede ser negativo").max(MONTO_MAXIMO, MENSAJE_MONTO_MAXIMO).transform(Math.round),
  cantidadCuotas: z.coerce.number().int().min(1, "Debe haber al menos 1 cuota").max(CUOTAS_MAXIMAS, MENSAJE_CUOTAS_MAXIMAS),
  frecuencia: z.enum(["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL"]),
  fechaInicio: z.string().min(1, "Obligatorio"),
});

type PrestamoValues = z.input<typeof prestamoSchema>;
type PrestamoOutput = z.output<typeof prestamoSchema>;

export function PrestamoForm({
  clientes,
  fuentesIngreso,
  defaultClienteId,
}: {
  clientes: { id: string; nombre: string }[];
  fuentesIngreso: { id: string; nombre: string }[];
  defaultClienteId?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [fuenteOpen, setFuenteOpen] = useState(false);

  const form = useForm<PrestamoValues, unknown, PrestamoOutput>({
    resolver: zodResolver(prestamoSchema),
    defaultValues: {
      clienteId: defaultClienteId ?? "",
      fuenteIngresoId: SIN_FUENTE,
      monto: 0,
      interes: 0,
      cantidadCuotas: 6,
      frecuencia: "MENSUAL",
      fechaInicio: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const values = form.watch();

  const simulacion = useMemo(() => {
    if (!values.monto || !values.cantidadCuotas || !values.fechaInicio) return [];
    if (Number(values.cantidadCuotas) > CUOTAS_MAXIMAS) return [];
    try {
      return generarCuotas({
        monto: Number(values.monto),
        interes: Number(values.interes) || 0,
        cantidadCuotas: Number(values.cantidadCuotas),
        frecuencia: values.frecuencia,
        fechaInicio: new Date(`${values.fechaInicio}T00:00:00`),
      });
    } catch {
      return [];
    }
  }, [values.monto, values.interes, values.cantidadCuotas, values.frecuencia, values.fechaInicio]);

  const totalCuotas = simulacion.reduce((s, c) => s + c.montoTotal, 0);

  async function onSubmit(data: PrestamoOutput) {
    setLoading(true);
    try {
      const res = await fetch("/api/prestamos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          fuenteIngresoId: data.fuenteIngresoId === SIN_FUENTE ? undefined : data.fuenteIngresoId,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        toast.error(typeof result.error === "string" ? result.error : "No se pudo crear el préstamo");
        return;
      }

      toast.success("Préstamo creado");
      router.push(`/prestamos/${result.id}`);
      router.refresh();
    } catch {
      toast.error("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="clienteId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Cliente</FormLabel>
                <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={clienteOpen}
                        className={cn(
                          "w-full justify-between font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value
                          ? clientes.find((c) => c.id === field.value)?.nombre
                          : "Seleccioná un cliente"}
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
                      <CommandInput placeholder="Buscar cliente por nombre..." />
                      <CommandList>
                        <CommandEmpty>No se encontró ningún cliente.</CommandEmpty>
                        <CommandGroup>
                          {clientes.map((cliente) => (
                            <CommandItem
                              key={cliente.id}
                              value={cliente.nombre}
                              onSelect={() => {
                                form.setValue("clienteId", cliente.id, {
                                  shouldValidate: true,
                                });
                                setClienteOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  cliente.id === field.value ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {cliente.nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fuenteIngresoId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Fuente de ingreso (opcional)</FormLabel>
                <Popover open={fuenteOpen} onOpenChange={setFuenteOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={fuenteOpen}
                        className={cn(
                          "w-full justify-between font-normal",
                          (!field.value || field.value === SIN_FUENTE) &&
                            "text-muted-foreground"
                        )}
                      >
                        {field.value && field.value !== SIN_FUENTE
                          ? fuentesIngreso.find((f) => f.id === field.value)?.nombre
                          : "Sin categorizar"}
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
                      <CommandInput placeholder="Buscar fuente de ingreso..." />
                      <CommandList>
                        <CommandEmpty>No se encontró ninguna fuente.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="Sin categorizar"
                            onSelect={() => {
                              form.setValue("fuenteIngresoId", SIN_FUENTE, {
                                shouldValidate: true,
                              });
                              setFuenteOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                !field.value || field.value === SIN_FUENTE
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            Sin categorizar
                          </CommandItem>
                          {fuentesIngreso.map((fuente) => (
                            <CommandItem
                              key={fuente.id}
                              value={fuente.nombre}
                              onSelect={() => {
                                form.setValue("fuenteIngresoId", fuente.id, {
                                  shouldValidate: true,
                                });
                                setFuenteOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  fuente.id === field.value ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {fuente.nombre}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="monto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto</FormLabel>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <FormField
              control={form.control}
              name="fechaInicio"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de inicio</FormLabel>
                  <DatePickerField
                    value={field.value ? new Date(`${field.value}T00:00:00`) : undefined}
                    onChange={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
                  />
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

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creando..." : "Crear préstamo"}
          </Button>
        </form>
      </Form>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Simulación del cronograma
          </h2>
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
                      Completá los datos para ver la simulación.
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
