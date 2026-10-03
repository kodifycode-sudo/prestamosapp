-- CreateTable
CREATE TABLE "IntentoAcceso" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentoAcceso_tipo_clave_createdAt_idx" ON "IntentoAcceso"("tipo", "clave", "createdAt");

-- CreateIndex
CREATE INDEX "IntentoAcceso_createdAt_idx" ON "IntentoAcceso"("createdAt");

