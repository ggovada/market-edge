-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactInfo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'demat',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "instrumentType" TEXT NOT NULL DEFAULT 'EQUITY',
    "quantity" DOUBLE PRECISION NOT NULL,
    "pricePerShare" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAuditLog" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT,
    "portfolioId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "openTradeId" TEXT NOT NULL,
    "quantityRemaining" DOUBLE PRECISION NOT NULL,
    "costBasisPerShare" DOUBLE PRECISION NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealizedGain" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "closeTradeId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "proceeds" DOUBLE PRECISION NOT NULL,
    "costBasis" DOUBLE PRECISION NOT NULL,
    "gainLoss" DOUBLE PRECISION NOT NULL,
    "term" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealizedGain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxSettings" (
    "id" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'IN',
    "stcgRatePct" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "ltcgRatePct" DOUBLE PRECISION NOT NULL DEFAULT 12.5,
    "ltcgExemptionAmountPerFY" DOUBLE PRECISION NOT NULL DEFAULT 125000,
    "longTermThresholdDays" INTEGER NOT NULL DEFAULT 365,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "ticker" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "dayChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dayChangePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "PortfolioValueSnapshot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "totalCostBasis" DOUBLE PRECISION NOT NULL,
    "realizedPl" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PortfolioValueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalInsight" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "levels" TEXT NOT NULL,
    "aiNarrative" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_portfolioId_ticker_idx" ON "Trade"("portfolioId", "ticker");

-- CreateIndex
CREATE INDEX "Trade_executedAt_idx" ON "Trade"("executedAt");

-- CreateIndex
CREATE INDEX "Lot_portfolioId_ticker_idx" ON "Lot"("portfolioId", "ticker");

-- CreateIndex
CREATE INDEX "RealizedGain_portfolioId_financialYear_idx" ON "RealizedGain"("portfolioId", "financialYear");

-- CreateIndex
CREATE INDEX "RealizedGain_term_idx" ON "RealizedGain"("term");

-- CreateIndex
CREATE INDEX "PortfolioValueSnapshot_portfolioId_date_idx" ON "PortfolioValueSnapshot"("portfolioId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioValueSnapshot_portfolioId_date_key" ON "PortfolioValueSnapshot"("portfolioId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalInsight_ticker_timeframe_key" ON "TechnicalInsight"("ticker", "timeframe");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAuditLog" ADD CONSTRAINT "TradeAuditLog_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAuditLog" ADD CONSTRAINT "TradeAuditLog_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_openTradeId_fkey" FOREIGN KEY ("openTradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealizedGain" ADD CONSTRAINT "RealizedGain_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealizedGain" ADD CONSTRAINT "RealizedGain_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealizedGain" ADD CONSTRAINT "RealizedGain_closeTradeId_fkey" FOREIGN KEY ("closeTradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioValueSnapshot" ADD CONSTRAINT "PortfolioValueSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
