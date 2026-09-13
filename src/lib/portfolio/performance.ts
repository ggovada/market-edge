import YahooFinance from "yahoo-finance2";
import { prisma } from "@/lib/db";
import { normalizeTicker } from "@/lib/utils";

export type PerformanceRange = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y";

export type PerformancePoint = {
  date: string;
  totalValue: number;
  totalCostBasis: number;
};

export type PerformanceSeries = {
  range: PerformanceRange;
  points: PerformancePoint[];
  startValue: number;
  endValue: number;
  change: number;
  changePct: number;
};

type ChartInterval = "15m" | "1h" | "1d";

const RANGE_CONFIG: Record<
  PerformanceRange,
  { daysBack: number | "ytd"; interval: ChartInterval }
> = {
  "1D": { daysBack: 2, interval: "15m" },
  "1W": { daysBack: 8, interval: "1h" },
  "1M": { daysBack: 32, interval: "1d" },
  "3M": { daysBack: 95, interval: "1d" },
  YTD: { daysBack: "ytd", interval: "1d" },
  "1Y": { daysBack: 370, interval: "1d" },
  "5Y": { daysBack: 365 * 5 + 5, interval: "1d" },
};

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function rangeStart(range: PerformanceRange, now = new Date()): Date {
  const cfg = RANGE_CONFIG[range];
  if (cfg.daysBack === "ytd") return new Date(now.getFullYear(), 0, 1);
  const s = new Date(now);
  s.setDate(s.getDate() - cfg.daysBack);
  return s;
}

function toKey(date: Date, interval: ChartInterval): string {
  if (interval === "1d") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return date.toISOString();
}

async function fetchCloses(
  ticker: string,
  interval: ChartInterval,
  period1: Date
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const result = await yf.chart(ticker, {
      period1,
      interval,
    });
    for (const c of result.quotes ?? []) {
      if (c.close == null || !c.date) continue;
      const d = new Date(c.date);
      map.set(toKey(d, interval), c.close);
    }
  } catch (e) {
    console.error(`chart failed for ${ticker}`, e);
  }
  return map;
}

function nearestPrice(
  map: Map<string, number>,
  keys: string[],
  index: number
): number | null {
  for (let i = index; i >= 0; i--) {
    const p = map.get(keys[i]);
    if (p != null && p > 0) return p;
  }
  for (let i = index + 1; i < keys.length; i++) {
    const p = map.get(keys[i]);
    if (p != null && p > 0) return p;
  }
  return null;
}

export async function buildOverallPerformance(
  range: PerformanceRange,
  opts?: { memberId?: string }
): Promise<PerformanceSeries> {
  const now = new Date();
  const from = rangeStart(range, now);
  // Pull a bit more history so prices exist before the visible window
  const historyFrom = new Date(from);
  historyFrom.setDate(historyFrom.getDate() - 14);
  const interval = RANGE_CONFIG[range].interval;

  const portfolios = await prisma.portfolio.findMany({
    where: opts?.memberId ? { memberId: opts.memberId } : undefined,
    select: { id: true },
  });
  const portfolioIds = portfolios.map((p) => p.id);
  if (!portfolioIds.length) return empty(range);

  const trades = await prisma.trade.findMany({
    where: { portfolioId: { in: portfolioIds }, deletedAt: null },
    orderBy: [{ executedAt: "asc" }, { createdAt: "asc" }],
    select: {
      ticker: true,
      action: true,
      quantity: true,
      pricePerShare: true,
      fees: true,
      executedAt: true,
    },
  });
  if (!trades.length) return empty(range);

  const tickers = [...new Set(trades.map((t) => normalizeTicker(t.ticker)))];

  const historyByTicker = new Map<string, Map<string, number>>();
  const allKeys = new Set<string>();

  await Promise.all(
    tickers.map(async (ticker) => {
      const map = await fetchCloses(ticker, interval, historyFrom);
      historyByTicker.set(ticker, map);
      for (const k of map.keys()) allKeys.add(k);
    })
  );

  const keys = [...allKeys].sort();
  const fromMs = from.getTime();
  const nowMs = now.getTime();
  const filteredKeys = keys.filter((k) => {
    const t = new Date(k.length === 10 ? `${k}T12:00:00` : k).getTime();
    return t >= fromMs && t <= nowMs;
  });
  if (!filteredKeys.length) return empty(range);

  const qtyByTicker = new Map<string, number>();
  const costByTicker = new Map<string, number>();
  let tradeIdx = 0;

  const apply = (t: (typeof trades)[number]) => {
    const ticker = normalizeTicker(t.ticker);
    const qty = qtyByTicker.get(ticker) ?? 0;
    const cost = costByTicker.get(ticker) ?? 0;
    if (t.action === "BUY") {
      qtyByTicker.set(ticker, qty + t.quantity);
      costByTicker.set(
        ticker,
        cost + t.quantity * t.pricePerShare + (t.fees || 0)
      );
    } else if (qty > 0) {
      const sellQty = Math.min(qty, t.quantity);
      const avg = cost / qty;
      const nextQty = qty - sellQty;
      if (nextQty <= 1e-9) {
        qtyByTicker.delete(ticker);
        costByTicker.delete(ticker);
      } else {
        qtyByTicker.set(ticker, nextQty);
        costByTicker.set(ticker, cost - avg * sellQty);
      }
    }
  };

  const points: PerformancePoint[] = [];

  for (let ki = 0; ki < filteredKeys.length; ki++) {
    const key = filteredKeys[ki];
    const keyTime = new Date(
      key.length === 10 ? `${key}T23:59:59` : key
    ).getTime();

    while (
      tradeIdx < trades.length &&
      trades[tradeIdx].executedAt.getTime() <= keyTime
    ) {
      apply(trades[tradeIdx]);
      tradeIdx++;
    }

    let totalValue = 0;
    let totalCost = 0;

    for (const [ticker, qty] of qtyByTicker) {
      if (qty <= 1e-9) continue;
      totalCost += costByTicker.get(ticker) ?? 0;
      const map = historyByTicker.get(ticker) ?? new Map();
      const price =
        map.get(key) ?? nearestPrice(map, filteredKeys, ki) ?? null;
      if (price != null) {
        totalValue += qty * price;
      } else {
        const avg = (costByTicker.get(ticker) ?? 0) / qty;
        totalValue += qty * avg;
      }
    }

    points.push({
      date: key,
      totalValue: Math.round(totalValue * 100) / 100,
      totalCostBasis: Math.round(totalCost * 100) / 100,
    });
  }

  if (!points.length) return empty(range);

  const startValue = points[0].totalValue;
  const endValue = points[points.length - 1].totalValue;
  const change = endValue - startValue;
  const changePct = startValue > 0 ? (change / startValue) * 100 : 0;

  return {
    range,
    points,
    startValue,
    endValue,
    change,
    changePct,
  };
}

function empty(range: PerformanceRange): PerformanceSeries {
  return {
    range,
    points: [],
    startValue: 0,
    endValue: 0,
    change: 0,
    changePct: 0,
  };
}
