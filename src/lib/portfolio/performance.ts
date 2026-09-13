import YahooFinance from "yahoo-finance2";
import { prisma } from "@/lib/db";
import { normalizeTicker } from "@/lib/utils";
import {
  contractMultiplier,
  isFuturesInstrument,
} from "@/lib/market/contract";

export type PerformanceRange = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y";

export type PerformancePoint = {
  date: string;
  totalValue: number;
  totalCostBasis: number;
  holdingsValue?: number;
  cashBalance?: number;
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
  const historyFrom = new Date(from);
  historyFrom.setDate(historyFrom.getDate() - 14);
  const interval = RANGE_CONFIG[range].interval;

  const portfolios = await prisma.portfolio.findMany({
    where: opts?.memberId ? { memberId: opts.memberId } : undefined,
    select: { id: true },
  });
  const portfolioIds = portfolios.map((p) => p.id);
  if (!portfolioIds.length) return empty(range);

  const [trades, cashTxns] = await Promise.all([
    prisma.trade.findMany({
      where: { portfolioId: { in: portfolioIds }, deletedAt: null },
      orderBy: [{ executedAt: "asc" }, { createdAt: "asc" }],
      select: {
        ticker: true,
        action: true,
        quantity: true,
        pricePerShare: true,
        fees: true,
        executedAt: true,
        instrumentType: true,
        lotSize: true,
        margin: true,
      },
    }),
    prisma.cashTransaction.findMany({
      where: { portfolioId: { in: portfolioIds } },
      orderBy: [{ executedAt: "asc" }, { createdAt: "asc" }],
      select: {
        type: true,
        amount: true,
        executedAt: true,
      },
    }),
  ]);

  if (!trades.length && !cashTxns.length) return empty(range);

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

  for (const c of cashTxns) {
    allKeys.add(toKey(c.executedAt, interval === "1d" ? "1d" : interval));
  }

  const keys = [...allKeys].sort();
  const fromMs = from.getTime();
  const nowMs = now.getTime();
  const filteredKeys = keys.filter((k) => {
    const t = new Date(k.length === 10 ? `${k}T12:00:00` : k).getTime();
    return t >= fromMs && t <= nowMs;
  });
  if (!filteredKeys.length) return empty(range);

  type Lot = { qty: number; cost: number; mult: number; isFut: boolean; margin: number };
  const lotsByTicker = new Map<string, Lot[]>();
  let cashBalance = 0;
  let marginBlocked = 0;
  let netDeposits = 0;
  let tradeIdx = 0;
  let cashIdx = 0;

  const applyTrade = (t: (typeof trades)[number]) => {
    const ticker = normalizeTicker(t.ticker);
    const isFut = isFuturesInstrument(t.instrumentType);
    const mult = contractMultiplier(t.instrumentType, t.lotSize);
    const fees = t.fees || 0;
    if (!lotsByTicker.has(ticker)) lotsByTicker.set(ticker, []);
    const q = lotsByTicker.get(ticker)!;

    if (!isFut) {
      const notional = t.quantity * t.pricePerShare;
      if (t.action === "BUY") {
        cashBalance -= notional + fees;
        q.push({
          qty: t.quantity,
          cost: notional + fees,
          mult: 1,
          isFut: false,
          margin: 0,
        });
      } else if (t.action === "SELL") {
        cashBalance += notional - fees;
        let remaining = t.quantity;
        while (remaining > 1e-9 && q.length > 0) {
          const lot = q[0];
          const take = Math.min(lot.qty, remaining);
          const frac = lot.qty > 0 ? take / lot.qty : 0;
          lot.qty -= take;
          lot.cost -= lot.cost * frac;
          remaining -= take;
          if (lot.qty <= 1e-9) q.shift();
        }
      }
      return;
    }

    if (t.action === "BUY") {
      const units = t.quantity * mult;
      const feePerUnit = units > 0 ? fees / units : 0;
      const margin = Math.max(0, (t as { margin?: number }).margin ?? 0);
      cashBalance -= margin;
      marginBlocked += margin;
      q.push({
        qty: t.quantity,
        cost: t.quantity * mult * (t.pricePerShare + feePerUnit),
        mult,
        isFut: true,
        margin,
      });
    } else if (t.action === "SELL") {
      let remaining = t.quantity;
      const sellUnits = t.quantity * mult;
      const feePerUnit = sellUnits > 0 ? fees / sellUnits : 0;
      const netExit = t.pricePerShare - feePerUnit;
      while (remaining > 1e-9 && q.length > 0) {
        const lot = q[0];
        const take = Math.min(lot.qty, remaining);
        const avgCostPerLot = lot.qty > 0 ? lot.cost / lot.qty : 0;
        const marginRelease = lot.qty > 0 ? (take / lot.qty) * lot.margin : 0;
        const proceeds = take * lot.mult * netExit;
        const costBasis = take * avgCostPerLot;
        cashBalance += marginRelease + (proceeds - costBasis);
        marginBlocked -= marginRelease;
        lot.qty -= take;
        lot.cost -= costBasis;
        lot.margin -= marginRelease;
        remaining -= take;
        if (lot.qty <= 1e-9) q.shift();
      }
    }
  };

  const applyCash = (c: (typeof cashTxns)[number]) => {
    if (c.type === "DEPOSIT") {
      cashBalance += c.amount;
      netDeposits += c.amount;
    } else if (c.type === "WITHDRAWAL") {
      cashBalance -= c.amount;
      netDeposits -= c.amount;
    }
  };

  const points: PerformancePoint[] = [];

  for (let ki = 0; ki < filteredKeys.length; ki++) {
    const key = filteredKeys[ki];
    const keyTime = new Date(
      key.length === 10 ? `${key}T23:59:59` : key
    ).getTime();

    while (
      cashIdx < cashTxns.length &&
      cashTxns[cashIdx].executedAt.getTime() <= keyTime
    ) {
      applyCash(cashTxns[cashIdx]);
      cashIdx++;
    }

    while (
      tradeIdx < trades.length &&
      trades[tradeIdx].executedAt.getTime() <= keyTime
    ) {
      applyTrade(trades[tradeIdx]);
      tradeIdx++;
    }

    let holdingsValue = 0;

    for (const [ticker, lots] of lotsByTicker) {
      const qty = lots.reduce((s, l) => s + l.qty, 0);
      const cost = lots.reduce((s, l) => s + l.cost, 0);
      if (qty <= 1e-9) continue;
      const isFut = lots.some((l) => l.isFut);
      const mult = lots[0]?.mult ?? 1;
      const map = historyByTicker.get(ticker) ?? new Map();
      const price =
        map.get(key) ?? nearestPrice(map, filteredKeys, ki) ?? null;
      if (isFut) {
        if (price != null) {
          holdingsValue += qty * mult * price - cost;
        }
      } else if (price != null) {
        holdingsValue += qty * price;
      } else {
        holdingsValue += cost;
      }
    }

    const totalValue = holdingsValue + cashBalance + Math.max(0, marginBlocked);

    points.push({
      date: key,
      totalValue: Math.round(totalValue * 100) / 100,
      totalCostBasis: Math.round(netDeposits * 100) / 100,
      holdingsValue: Math.round(holdingsValue * 100) / 100,
      cashBalance: Math.round(cashBalance * 100) / 100,
    });
  }

  const firstActive = points.findIndex(
    (p) => Math.abs(p.totalValue) > 1e-6 || (p.cashBalance ?? 0) !== 0
  );
  const seriesPoints = firstActive >= 0 ? points.slice(firstActive) : [];
  if (!seriesPoints.length) return empty(range);

  const startValue = seriesPoints[0].totalValue;
  const endValue = seriesPoints[seriesPoints.length - 1].totalValue;
  const startKey =
    seriesPoints[0].date.length >= 10
      ? seriesPoints[0].date.slice(0, 10)
      : toKey(new Date(seriesPoints[0].date), "1d");
  const endKey =
    seriesPoints[seriesPoints.length - 1].date.length >= 10
      ? seriesPoints[seriesPoints.length - 1].date.slice(0, 10)
      : toKey(new Date(seriesPoints[seriesPoints.length - 1].date), "1d");

  let netExternalFlow = 0;
  for (const c of cashTxns) {
    const key = toKey(c.executedAt, "1d");
    if (key <= startKey || key > endKey) continue;
    if (c.type === "DEPOSIT") netExternalFlow += c.amount;
    else if (c.type === "WITHDRAWAL") netExternalFlow -= c.amount;
  }

  const change = endValue - startValue - netExternalFlow;
  const capitalBase = Math.max(
    Math.abs(startValue + netExternalFlow),
    Math.abs(seriesPoints[seriesPoints.length - 1].totalCostBasis ?? 0),
    Math.abs(startValue)
  );
  const changePct =
    capitalBase >= 1_000 ? (change / capitalBase) * 100 : 0;

  return {
    range,
    points: seriesPoints,
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
