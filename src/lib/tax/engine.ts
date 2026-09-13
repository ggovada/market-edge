import { prisma } from "@/lib/db";
import { contractMultiplier } from "@/lib/market/contract";
import { daysBetween, getFinancialYear, normalizeTicker } from "@/lib/utils";

export type TaxConfig = {
  stcgRatePct: number;
  ltcgRatePct: number;
  ltcgExemptionAmountPerFY: number;
  longTermThresholdDays: number;
};

const DEFAULT_TAX: TaxConfig = {
  stcgRatePct: 20,
  ltcgRatePct: 12.5,
  ltcgExemptionAmountPerFY: 125000,
  longTermThresholdDays: 365,
};

export async function getActiveTaxSettings(): Promise<TaxConfig> {
  const settings = await prisma.taxSettings.findFirst({
    orderBy: { effectiveFrom: "desc" },
  });
  if (!settings) return DEFAULT_TAX;
  return {
    stcgRatePct: settings.stcgRatePct,
    ltcgRatePct: settings.ltcgRatePct,
    ltcgExemptionAmountPerFY: settings.ltcgExemptionAmountPerFY,
    longTermThresholdDays: settings.longTermThresholdDays,
  };
}

export async function ensureDefaultTaxSettings() {
  const count = await prisma.taxSettings.count();
  if (count === 0) {
    await prisma.taxSettings.create({
      data: {
        jurisdiction: "IN",
        ...DEFAULT_TAX,
        effectiveFrom: new Date("2024-07-23"),
      },
    });
  }
}

/**
 * Rebuild lots + realized gains for a portfolio from active (non-deleted) trades.
 * FIFO lot consumption matches Indian tax expectations for identical securities.
 */
export async function rebuildPortfolioLots(portfolioId: string) {
  const tax = await getActiveTaxSettings();

  const trades = await prisma.trade.findMany({
    where: { portfolioId, deletedAt: null },
    orderBy: [{ executedAt: "asc" }, { createdAt: "asc" }],
  });

  await prisma.realizedGain.deleteMany({ where: { portfolioId } });
  await prisma.lot.deleteMany({ where: { portfolioId } });

  // In-memory FIFO queues per ticker
  type OpenLot = {
    id: string;
    openTradeId: string;
    quantityRemaining: number;
    costBasisPerShare: number;
    acquiredAt: Date;
    instrumentType: string;
    lotSize: number;
    marginRemaining: number;
  };
  const queues = new Map<string, OpenLot[]>();

  for (const trade of trades) {
    const ticker = normalizeTicker(trade.ticker);
    if (!queues.has(ticker)) queues.set(ticker, []);
    const q = queues.get(ticker)!;
    const mult = contractMultiplier(trade.instrumentType, trade.lotSize);

    if (trade.action === "BUY") {
      // Allocate fees into per-unit cost (unit = share, or 1 underlying for futures)
      const units = trade.quantity * mult;
      const feePerUnit = units > 0 ? trade.fees / units : 0;
      const margin =
        trade.instrumentType === "FUTURES"
          ? Math.max(0, trade.margin ?? 0)
          : 0;
      const lot = await prisma.lot.create({
        data: {
          portfolioId,
          ticker,
          openTradeId: trade.id,
          quantityRemaining: trade.quantity,
          costBasisPerShare: trade.pricePerShare + feePerUnit,
          marginRemaining: margin,
          acquiredAt: trade.executedAt,
        },
      });
      q.push({
        id: lot.id,
        openTradeId: trade.id,
        quantityRemaining: trade.quantity,
        costBasisPerShare: trade.pricePerShare + feePerUnit,
        acquiredAt: trade.executedAt,
        instrumentType: trade.instrumentType,
        lotSize: trade.lotSize ?? 1,
        marginRemaining: margin,
      });
    } else if (trade.action === "SELL") {
      let remaining = trade.quantity;
      const sellUnits = trade.quantity * mult;
      const feePerUnit = sellUnits > 0 ? trade.fees / sellUnits : 0;
      const netPrice = trade.pricePerShare - feePerUnit;

      while (remaining > 1e-9 && q.length > 0) {
        const lot = q[0];
        const take = Math.min(lot.quantityRemaining, remaining);
        const lotMult = contractMultiplier(lot.instrumentType, lot.lotSize);
        // P/L = lots × lotSize × (exit − entry)
        const proceeds = take * lotMult * netPrice;
        const costBasis = take * lotMult * lot.costBasisPerShare;
        const gainLoss = proceeds - costBasis;
        const marginRelease =
          lot.quantityRemaining > 0
            ? (take / lot.quantityRemaining) * (lot.marginRemaining ?? 0)
            : 0;
        const holdingDays = daysBetween(lot.acquiredAt, trade.executedAt);
        // Futures/F&O are not equity LTCG — treat realized futures P/L as STCG for tracking
        const term =
          trade.instrumentType === "FUTURES" ||
          lot.instrumentType === "FUTURES" ||
          holdingDays <= tax.longTermThresholdDays
            ? "STCG"
            : "LTCG";
        const fy = getFinancialYear(trade.executedAt);

        await prisma.realizedGain.create({
          data: {
            portfolioId,
            ticker,
            lotId: lot.id,
            closeTradeId: trade.id,
            quantity: take,
            proceeds,
            costBasis,
            gainLoss,
            term,
            financialYear: fy,
            closedAt: trade.executedAt,
          },
        });

        lot.quantityRemaining -= take;
        lot.marginRemaining = (lot.marginRemaining ?? 0) - marginRelease;
        remaining -= take;

        if (lot.quantityRemaining <= 1e-9) {
          await prisma.lot.update({
            where: { id: lot.id },
            data: { quantityRemaining: 0, marginRemaining: 0 },
          });
          q.shift();
        } else {
          await prisma.lot.update({
            where: { id: lot.id },
            data: {
              quantityRemaining: lot.quantityRemaining,
              marginRemaining: Math.max(0, lot.marginRemaining ?? 0),
            },
          });
        }
      }

      if (remaining > 1e-6) {
        console.warn(
          `Sell exceeds holdings for ${ticker} in portfolio ${portfolioId}: ${remaining} unmatched`
        );
      }
    }
  }

  // Clean zero lots
  await prisma.lot.deleteMany({
    where: { portfolioId, quantityRemaining: { lte: 1e-9 } },
  });
}

export type HoldingRow = {
  ticker: string;
  instrumentType: "EQUITY" | "FUTURES";
  quantity: number;
  lotSize: number;
  avgCost: number;
  costBasis: number;
  /** Futures margin still blocked on open lots */
  marginBlocked: number;
  lots: {
    id: string;
    quantity: number;
    costBasisPerShare: number;
    acquiredAt: Date;
    daysHeld: number;
    daysToLongTerm: number;
    term: "STCG" | "LTCG";
  }[];
};

export async function getHoldings(portfolioId: string): Promise<HoldingRow[]> {
  const tax = await getActiveTaxSettings();
  const lots = await prisma.lot.findMany({
    where: { portfolioId, quantityRemaining: { gt: 0 } },
    include: {
      openTrade: { select: { instrumentType: true, lotSize: true } },
    },
    orderBy: { acquiredAt: "asc" },
  });

  const byTicker = new Map<string, typeof lots>();
  for (const lot of lots) {
    if (!byTicker.has(lot.ticker)) byTicker.set(lot.ticker, []);
    byTicker.get(lot.ticker)!.push(lot);
  }

  const now = new Date();
  const rows: HoldingRow[] = [];

  for (const [ticker, tickerLots] of byTicker) {
    const quantity = tickerLots.reduce((s, l) => s + l.quantityRemaining, 0);
    const isFutures = tickerLots.some(
      (l) => l.openTrade.instrumentType === "FUTURES"
    );
    const lotSize = isFutures
      ? Math.max(
          1,
          ...tickerLots.map((l) =>
            contractMultiplier(l.openTrade.instrumentType, l.openTrade.lotSize)
          )
        )
      : 1;
    // For mixed lot sizes (rare), cost uses each lot's own multiplier
    const costBasis = tickerLots.reduce((s, l) => {
      const m = contractMultiplier(
        l.openTrade.instrumentType,
        l.openTrade.lotSize
      );
      return s + l.quantityRemaining * m * l.costBasisPerShare;
    }, 0);
    const units = tickerLots.reduce((s, l) => {
      const m = contractMultiplier(
        l.openTrade.instrumentType,
        l.openTrade.lotSize
      );
      return s + l.quantityRemaining * m;
    }, 0);
    const marginBlocked = tickerLots.reduce(
      (s, l) => s + (l.marginRemaining ?? 0),
      0
    );
    rows.push({
      ticker,
      instrumentType: isFutures ? "FUTURES" : "EQUITY",
      quantity,
      lotSize: isFutures ? lotSize : 1,
      avgCost: units > 0 ? costBasis / units : 0,
      costBasis,
      marginBlocked,
      lots: tickerLots.map((l) => {
        const daysHeld = daysBetween(l.acquiredAt, now);
        const isFut = l.openTrade.instrumentType === "FUTURES";
        const daysToLongTerm = isFut
          ? 0
          : Math.max(0, tax.longTermThresholdDays + 1 - daysHeld);
        return {
          id: l.id,
          quantity: l.quantityRemaining,
          costBasisPerShare: l.costBasisPerShare,
          acquiredAt: l.acquiredAt,
          daysHeld,
          daysToLongTerm,
          term: isFut || daysHeld <= tax.longTermThresholdDays
            ? ("STCG" as const)
            : ("LTCG" as const),
        };
      }),
    });
  }

  return rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export async function getMemberLtcgExemption(
  memberId: string,
  financialYear?: string
) {
  const tax = await getActiveTaxSettings();
  const fy = financialYear ?? getFinancialYear(new Date());

  const portfolios = await prisma.portfolio.findMany({
    where: { memberId },
    select: { id: true },
  });
  const ids = portfolios.map((p) => p.id);

  const gains = await prisma.realizedGain.findMany({
    where: {
      portfolioId: { in: ids },
      financialYear: fy,
      term: "LTCG",
    },
  });

  const totalLtcg = gains.reduce((s, g) => s + Math.max(0, g.gainLoss), 0);
  const used = Math.min(totalLtcg, tax.ltcgExemptionAmountPerFY);
  const remaining = Math.max(0, tax.ltcgExemptionAmountPerFY - used);
  const taxableLtcg = Math.max(0, totalLtcg - tax.ltcgExemptionAmountPerFY);
  const estimatedTax =
    taxableLtcg * (tax.ltcgRatePct / 100) +
    (await getStcgTax(ids, fy, tax));

  return {
    financialYear: fy,
    exemptionLimit: tax.ltcgExemptionAmountPerFY,
    totalLtcgGains: totalLtcg,
    exemptionUsed: used,
    exemptionRemaining: remaining,
    taxableLtcg,
    ltcgRatePct: tax.ltcgRatePct,
    stcgRatePct: tax.stcgRatePct,
    estimatedTaxOnGains: estimatedTax,
  };
}

async function getStcgTax(portfolioIds: string[], fy: string, tax: TaxConfig) {
  const gains = await prisma.realizedGain.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      financialYear: fy,
      term: "STCG",
    },
  });
  const total = gains.reduce((s, g) => s + g.gainLoss, 0);
  return Math.max(0, total) * (tax.stcgRatePct / 100);
}

export async function getRealizedSummary(
  portfolioId: string,
  financialYear?: string | "ALL"
) {
  const fy = financialYear ?? getFinancialYear(new Date());
  const gains = await prisma.realizedGain.findMany({
    where: {
      portfolioId,
      ...(fy === "ALL" ? {} : { financialYear: fy }),
    },
  });
  const stcg = gains.filter((g) => g.term === "STCG");
  const ltcg = gains.filter((g) => g.term === "LTCG");
  return {
    financialYear: fy,
    stcg: {
      count: stcg.length,
      gainLoss: stcg.reduce((s, g) => s + g.gainLoss, 0),
    },
    ltcg: {
      count: ltcg.length,
      gainLoss: ltcg.reduce((s, g) => s + g.gainLoss, 0),
    },
    total: gains.reduce((s, g) => s + g.gainLoss, 0),
  };
}
