import { prisma } from "@/lib/db";
import { getHoldings, getRealizedSummary } from "@/lib/tax/engine";
import { getCachedQuotes } from "@/lib/market/quotes";
import {
  contractMultiplier,
  holdingBookValue,
  isFuturesInstrument,
} from "@/lib/market/contract";
import { getPortfolioCashBreakdown } from "@/lib/portfolio/cash";

export type PortfolioMetrics = {
  portfolioId: string;
  /** Cost basis of open equity holdings (futures excluded — P/L only) */
  holdingsCostBasis: number;
  /** Equity MTM + futures unrealized P/L */
  holdingsValue: number;
  /** Free cash incl. retained prior booked P&L */
  cashBalance: number;
  /** Futures margin currently blocked */
  marginBlocked: number;
  /** Net money deposited (deposits − withdrawals) */
  netDeposits: number;
  /** Prior booked P&L included inside cashBalance */
  bookedPlRetained: number;
  /** Holdings + free cash + blocked margin */
  currentValue: number;
  /** Alias kept for older UI: cost basis of holdings */
  totalInvested: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  realizedPl: number;
  /** AUM − net deposits */
  totalPl: number;
  dayChange: number;
  dayChangePct: number;
  holdingsCount: number;
};

export async function computePortfolioMetrics(
  portfolioId: string
): Promise<PortfolioMetrics> {
  const holdings = await getHoldings(portfolioId);
  const tickers = holdings.map((h) => h.ticker);
  const quotes = await getCachedQuotes(tickers);
  const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));
  const cash = await getPortfolioCashBreakdown(portfolioId);

  let holdingsCostBasis = 0;
  let holdingsValue = 0;
  let unrealizedPl = 0;
  let dayChange = 0;

  for (const h of holdings) {
    const q = quoteMap.get(h.ticker);
    const price = q?.price ?? h.avgCost;
    const book = holdingBookValue({
      quantity: h.quantity,
      markPrice: price,
      costBasis: h.costBasis,
      avgCost: h.avgCost,
      instrumentType: h.instrumentType,
      lotSize: h.lotSize,
    });
    holdingsValue += book;

    if (isFuturesInstrument(h.instrumentType)) {
      unrealizedPl += book;
    } else {
      holdingsCostBasis += h.costBasis;
      unrealizedPl += book - h.costBasis;
    }

    if (q) {
      dayChange +=
        h.quantity *
        contractMultiplier(h.instrumentType, h.lotSize) *
        q.dayChange;
    }
  }

  const realized = await getRealizedSummary(portfolioId, "ALL");
  // cashBalance already includes retained booked P&L
  const currentValue =
    holdingsValue + cash.cashBalance + cash.marginBlocked;
  const totalPl = currentValue - cash.netDeposits;
  const priorHoldingsApprox = holdingsValue - dayChange;
  const dayChangePct =
    Math.abs(priorHoldingsApprox) > 1e-6
      ? (dayChange / Math.abs(priorHoldingsApprox)) * 100
      : 0;

  return {
    portfolioId,
    holdingsCostBasis,
    holdingsValue,
    cashBalance: cash.cashBalance,
    marginBlocked: cash.marginBlocked,
    netDeposits: cash.netDeposits,
    bookedPlRetained: cash.bookedPlRetained,
    currentValue,
    totalInvested: holdingsCostBasis,
    unrealizedPl,
    unrealizedPlPct:
      holdingsCostBasis > 0 ? (unrealizedPl / holdingsCostBasis) * 100 : 0,
    realizedPl: realized.total,
    totalPl,
    dayChange,
    dayChangePct,
    holdingsCount: holdings.length,
  };
}

export async function snapshotAllPortfolios() {
  const portfolios = await prisma.portfolio.findMany({ select: { id: true } });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const p of portfolios) {
    const m = await computePortfolioMetrics(p.id);
    await prisma.portfolioValueSnapshot.upsert({
      where: {
        portfolioId_date: { portfolioId: p.id, date: today },
      },
      create: {
        portfolioId: p.id,
        date: today,
        totalValue: m.currentValue,
        totalCostBasis: m.netDeposits || m.holdingsCostBasis,
        realizedPl: m.realizedPl,
      },
      update: {
        totalValue: m.currentValue,
        totalCostBasis: m.netDeposits || m.holdingsCostBasis,
        realizedPl: m.realizedPl,
      },
    });
  }
}
