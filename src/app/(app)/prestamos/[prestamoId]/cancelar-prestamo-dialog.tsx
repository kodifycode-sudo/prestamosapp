"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMonto } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MetodoPago = "EFECTIVO" | "TRANSFERENCIA" | "OTRO";

/** Cobra de una vez el saldo de todas las cuotas pendientes. El monto no se edita. */
export function CancelarPrestamoDialog({
  prestamoId,
  saldoPendiente,
  cuotasPendientes,
  open,
  onOpenChange,
}: {
  prestamoId: string;
  saldoPendiente: number;
  cuotasPendientes: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("EFECTIVO");
  const [observacion, setObservacion] = useState("");

  async function handleConfirmar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/prestamos/${prestamoId}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montoEsperado: saldoPendiente, metodoPago, observacion }),
      });
      const result = await res.json();

      if (!res.ok) {
        toast.error(typeof result.error === "string" ? result.error : "No se pudo cancelar el préstamo");
        if (result.code === "SALDO_CAMBIO") router.refresh();
        return;
      }

      toast.success("Préstamo cancelado: se cobraron todas las cuotas pendientes");
      onOpenChange(false);
      router.refresh();
    } catch {
      toast.error("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar préstamo</DialogTitle>
          <DialogDescription>
            Se cobran juntas las {cuotasPendientes} cuotas pendientes y el préstamo queda cancelado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleConfirmar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="monto-cancelacion">Monto total a pagar (saldo pendiente)</Label>
            <Input id="monto-cancelacion" value={formatMonto(saldoPendiente)} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label>Método de pago</Label>
            <Select value={metodoPago} onValueChange={(v) => setMetodoPago(v as MetodoPago)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                <SelectItem value="OTRO">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacion-cancelacion">Observación (opcional)</Label>
            <Textarea
              id="observacion-cancelacion"
              value={observacion}
              maxLength={480}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Cancelando..." : `Confirmar pago de ${formatMonto(saldoPendiente)}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
