import { prisma } from "@/lib/db";
import { getHoldings, getRealizedSummary } from "@/lib/tax/engine";
import { getCachedQuotes } from "@/lib/market/quotes";

export type PortfolioMetrics = {
  portfolioId: string;
  totalInvested: number;
  currentValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  realizedPl: number;
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

  let totalInvested = 0;
  let currentValue = 0;
  let dayChange = 0;

  for (const h of holdings) {
    totalInvested += h.costBasis;
    const q = quoteMap.get(h.ticker);
    const price = q?.price ?? h.avgCost;
    currentValue += h.quantity * price;
    if (q) {
      dayChange += h.quantity * q.dayChange;
    }
  }

  const realized = await getRealizedSummary(portfolioId, "ALL");
  const unrealizedPl = currentValue - totalInvested;
  const dayChangePct = currentValue - dayChange > 0
    ? (dayChange / (currentValue - dayChange)) * 100
    : 0;

  return {
    portfolioId,
    totalInvested,
    currentValue,
    unrealizedPl,
    unrealizedPlPct: totalInvested > 0 ? (unrealizedPl / totalInvested) * 100 : 0,
    realizedPl: realized.total,
    totalPl: unrealizedPl + realized.total,
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
        totalCostBasis: m.totalInvested,
        realizedPl: m.realizedPl,
      },
      update: {
        totalValue: m.currentValue,
        totalCostBasis: m.totalInvested,
        realizedPl: m.realizedPl,
      },
    });
  }
}
