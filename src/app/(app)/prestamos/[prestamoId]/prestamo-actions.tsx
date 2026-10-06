"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CancelarPrestamoDialog } from "./cancelar-prestamo-dialog";

/**
 * Anular: dar de baja un préstamo mal cargado (solo administradores y sin ningún pago).
 * Cancelar: cobrar de una vez el saldo de todas las cuotas pendientes.
 */
export function PrestamoActions({
  prestamoId,
  estado,
  esAdmin,
  tienePagos,
  saldoPendiente,
  cuotasPendientes,
}: {
  prestamoId: string;
  estado: string;
  esAdmin: boolean;
  tienePagos: boolean;
  saldoPendiente: number;
  cuotasPendientes: number;
}) {
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);

  if (estado !== "ACTIVO") return null;

  async function handleAnular() {
    if (!confirm("¿Está seguro que desea anular el préstamo?")) return;
    setAnulando(true);
    try {
      const res = await fetch(`/api/prestamos/${prestamoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "ANULADO" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "No se pudo anular");
        return;
      }
      toast.success("Préstamo anulado");
      router.refresh();
    } catch {
      toast.error("Error de conexión con el servidor");
    } finally {
      setAnulando(false);
    }
  }

  return (
    <>
      {saldoPendiente > 0 && (
        <Button variant="outline" size="sm" onClick={() => setCancelarOpen(true)}>
          <CheckCheck className="size-4" />
          Cancelar
        </Button>
      )}
      {esAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnular}
          disabled={anulando || tienePagos}
          title={tienePagos ? "No se puede anular: ya tiene pagos registrados" : undefined}
        >
          <Ban className="size-4" />
          Anular
        </Button>
      )}
      <CancelarPrestamoDialog
        prestamoId={prestamoId}
        saldoPendiente={saldoPendiente}
        cuotasPendientes={cuotasPendientes}
        open={cancelarOpen}
        onOpenChange={setCancelarOpen}
      />
    </>
  );
}
