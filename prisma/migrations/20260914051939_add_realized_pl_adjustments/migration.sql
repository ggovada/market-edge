-- CreateTable
CREATE TABLE "RealizedPlAdjustment" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "bookedAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "term" TEXT NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealizedPlAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RealizedPlAdjustment_portfolioId_bookedAt_idx" ON "RealizedPlAdjustment"("portfolioId", "bookedAt");

-- AddForeignKey
ALTER TABLE "RealizedPlAdjustment" ADD CONSTRAINT "RealizedPlAdjustment_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
