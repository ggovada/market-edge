import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHoldings, getRealizedSummary, getMemberLtcgExemption, getActiveTaxSettings } from "@/lib/tax/engine";
import { computePortfolioMetrics } from "@/lib/portfolio/metrics";
import { getCachedQuotes } from "@/lib/market/quotes";
import { holdingBookValue, notionalValue } from "@/lib/market/contract";
import { getPortfolioCashBreakdown } from "@/lib/portfolio/cash";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const portfolio = await prisma.portfolio.findUnique({
      where: { id },
      include: { member: true },
    });
    if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const holdings = await getHoldings(id);
    const quotes = await getCachedQuotes(holdings.map((h) => h.ticker));
    const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));
    const metrics = await computePortfolioMetrics(id);
    const cash = await getPortfolioCashBreakdown(id);
    const realized = await getRealizedSummary(id);
    const realizedAllTime = await getRealizedSummary(id, "ALL");
    const tax = await getActiveTaxSettings();
    const ltcg = await getMemberLtcgExemption(portfolio.memberId);

    const denom =
      Math.abs(metrics.currentValue) > 1e-6
        ? Math.abs(metrics.currentValue)
        : Math.abs(metrics.holdingsValue);

    const holdingsDetailed = holdings.map((h) => {
      const q = quoteMap.get(h.ticker);
      const price = q?.price ?? h.avgCost;
      const marketValue = holdingBookValue({
        quantity: h.quantity,
        markPrice: price,
        costBasis: h.costBasis,
        avgCost: h.avgCost,
        instrumentType: h.instrumentType,
        lotSize: h.lotSize,
      });
      const notional = notionalValue(
        h.quantity,
        price,
        h.instrumentType,
        h.lotSize
      );
      // Futures: marketValue is already unrealized P/L
      const unrealized =
        h.instrumentType === "FUTURES" ? marketValue : marketValue - h.costBasis;
      return {
        ...h,
        price,
        marketValue,
        notional,
        unrealized,
        unrealizedPct:
          h.instrumentType === "FUTURES"
            ? h.costBasis > 0
              ? (unrealized / h.costBasis) * 100
              : 0
            : h.costBasis > 0
              ? (unrealized / h.costBasis) * 100
              : 0,
        dayChange: q?.dayChange ?? 0,
        dayChangePct: q?.dayChangePct ?? 0,
        quoteFetchedAt: q?.fetchedAt ?? null,
        weightPct: denom > 0 ? (marketValue / denom) * 100 : 0,
      };
    });

    const snapshots = await prisma.portfolioValueSnapshot.findMany({
      where: { portfolioId: id },
      orderBy: { date: "asc" },
      take: 365,
    });

    const trades = await prisma.trade.findMany({
      where: { portfolioId: id, deletedAt: null },
      orderBy: { executedAt: "desc" },
      take: 200,
    });

    const gains = await prisma.realizedGain.findMany({
      where: { portfolioId: id },
      orderBy: { closedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      portfolio,
      metrics,
      cash,
      holdings: holdingsDetailed,
      realized,
      realizedAllTime,
      ltcgExemption: ltcg,
      taxSettings: tax,
      snapshots,
      trades,
      gains,
    });
  } catch (e) {
    console.error("GET /api/portfolios/[id]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load portfolio" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const portfolio = await prisma.portfolio.update({
    where: { id },
    data: {
      ...(body.name != null && { name: body.name }),
      ...(body.type != null && { type: body.type }),
      ...(body.currency != null && { currency: body.currency }),
    },
  });
  return NextResponse.json(portfolio);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.portfolio.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
