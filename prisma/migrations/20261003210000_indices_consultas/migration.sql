-- CreateIndex
CREATE INDEX "Prestamo_empresaId_estado_idx" ON "Prestamo"("empresaId", "estado");

-- CreateIndex
CREATE INDEX "Cuota_fechaVencimiento_estado_idx" ON "Cuota"("fechaVencimiento", "estado");

-- CreateIndex
CREATE INDEX "Pago_empresaId_fechaPago_idx" ON "Pago"("empresaId", "fechaPago");

-- CreateIndex
CREATE INDEX "Auditoria_empresaId_createdAt_idx" ON "Auditoria"("empresaId", "createdAt");

