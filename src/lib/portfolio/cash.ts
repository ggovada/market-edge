import { prisma } from "@/lib/db";
import {
  contractMultiplier,
  isFuturesInstrument,
} from "@/lib/market/contract";
import { normalizeTicker } from "@/lib/utils";

export type CashTxnType = "DEPOSIT" | "WITHDRAWAL";

export type CashTrade = {
  ticker: string;
  action: string;
  quantity: number;
  pricePerShare: number;
  fees?: number | null;
  instrumentType?: string | null;
  lotSize?: number | null;
  margin?: number | null;
};

/**
 * Equity: BUY drains notional+fees, SELL adds notional−fees.
 * Futures: BUY drains margin (blocked); SELL releases margin + realized P/L.
 */
export function computeTradesCashImpact(trades: CashTrade[]): {
  tradeCash: number;
  marginBlocked: number;
} {
  type Lot = {
    qty: number;
    cost: number;
    mult: number;
    margin: number;
  };
  const queues = new Map<string, Lot[]>();
  let cash = 0;
  let marginBlocked = 0;

  for (const trade of trades) {
    const ticker = normalizeTicker(trade.ticker);
    const isFut = isFuturesInstrument(trade.instrumentType);
    const mult = contractMultiplier(trade.instrumentType, trade.lotSize);
    const fees = trade.fees ?? 0;

    if (!queues.has(ticker)) queues.set(ticker, []);
    const q = queues.get(ticker)!;

    if (!isFut) {
      const notional = trade.quantity * trade.pricePerShare;
      if (trade.action === "BUY") {
        cash -= notional + fees;
        q.push({
          qty: trade.quantity,
          cost: notional + fees,
          mult: 1,
          margin: 0,
        });
      } else if (trade.action === "SELL") {
        cash += notional - fees;
        let remaining = trade.quantity;
        while (remaining > 1e-9 && q.length > 0) {
          const lot = q[0];
          const take = Math.min(lot.qty, remaining);
          const frac = take / lot.qty;
          lot.qty -= take;
          lot.cost -= lot.cost * frac;
          remaining -= take;
          if (lot.qty <= 1e-9) q.shift();
        }
      }
      continue;
    }

    // Futures
    if (trade.action === "BUY") {
      const units = trade.quantity * mult;
      const feePerUnit = units > 0 ? fees / units : 0;
      const margin = Math.max(0, trade.margin ?? 0);
      cash -= margin;
      marginBlocked += margin;
      q.push({
        qty: trade.quantity,
        cost: trade.quantity * mult * (trade.pricePerShare + feePerUnit),
        mult,
        margin,
      });
    } else if (trade.action === "SELL") {
      let remaining = trade.quantity;
      const sellUnits = trade.quantity * mult;
      const feePerUnit = sellUnits > 0 ? fees / sellUnits : 0;
      const netExit = trade.pricePerShare - feePerUnit;

      while (remaining > 1e-9 && q.length > 0) {
        const lot = q[0];
        const take = Math.min(lot.qty, remaining);
        const avgCostPerLot = lot.qty > 0 ? lot.cost / lot.qty : 0;
        const marginRelease =
          lot.qty > 0 ? (take / lot.qty) * lot.margin : 0;
        const proceeds = take * lot.mult * netExit;
        const costBasis = take * avgCostPerLot;
        // Release blocked margin, then settle P/L
        cash += marginRelease + (proceeds - costBasis);
        marginBlocked -= marginRelease;
        lot.qty -= take;
        lot.cost -= costBasis;
        lot.margin -= marginRelease;
        remaining -= take;
        if (lot.qty <= 1e-9) q.shift();
      }
    }
  }

  return {
    tradeCash: cash,
    marginBlocked: Math.max(0, marginBlocked),
  };
}

/** @deprecated Prefer computeTradesCashImpact for mixed books. */
export function tradeCashDelta(trade: CashTrade): number {
  return computeTradesCashImpact([trade]).tradeCash;
}

export async function getPortfolioCashBreakdown(portfolioId: string) {
  const [cashTxns, trades] = await Promise.all([
    prisma.cashTransaction.findMany({
      where: { portfolioId },
      orderBy: [{ executedAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.trade.findMany({
      where: { portfolioId, deletedAt: null },
      orderBy: [{ executedAt: "asc" }, { createdAt: "asc" }],
      select: {
        ticker: true,
        action: true,
        quantity: true,
        pricePerShare: true,
        fees: true,
        instrumentType: true,
        lotSize: true,
        margin: true,
      },
    }),
  ]);

  let deposits = 0;
  let withdrawals = 0;
  for (const t of cashTxns) {
    if (t.type === "DEPOSIT") deposits += t.amount;
    else if (t.type === "WITHDRAWAL") withdrawals += t.amount;
  }

  const { tradeCash, marginBlocked } = computeTradesCashImpact(trades);
  const netDeposits = deposits - withdrawals;
  const cashBalance = netDeposits + tradeCash;

  return {
    deposits,
    withdrawals,
    netDeposits,
    tradeCash,
    marginBlocked,
    cashBalance,
    transactions: cashTxns,
  };
}

export async function getPortfolioCashBalance(
  portfolioId: string
): Promise<number> {
  const b = await getPortfolioCashBreakdown(portfolioId);
  return b.cashBalance;
}

/** Net capital in (deposits − withdrawals) across portfolios. */
export async function getNetDeposits(portfolioId: string): Promise<number> {
  const rows = await prisma.cashTransaction.groupBy({
    by: ["type"],
    where: { portfolioId },
    _sum: { amount: true },
  });
  let deposits = 0;
  let withdrawals = 0;
  for (const r of rows) {
    const amt = r._sum.amount ?? 0;
    if (r.type === "DEPOSIT") deposits = amt;
    if (r.type === "WITHDRAWAL") withdrawals = amt;
  }
  return deposits - withdrawals;
}

export async function createCashTransaction(input: {
  portfolioId: string;
  type: CashTxnType;
  amount: number;
  executedAt: Date | string;
  notes?: string;
}) {
  if (input.amount <= 0) throw new Error("Amount must be positive");
  if (input.type !== "DEPOSIT" && input.type !== "WITHDRAWAL") {
    throw new Error("type must be DEPOSIT or WITHDRAWAL");
  }
  return prisma.cashTransaction.create({
    data: {
      portfolioId: input.portfolioId,
      type: input.type,
      amount: input.amount,
      executedAt: new Date(input.executedAt),
      notes: input.notes,
    },
  });
}

export async function updateCashTransaction(
  id: string,
  input: {
    type?: CashTxnType;
    amount?: number;
    executedAt?: Date | string;
    notes?: string | null;
  }
) {
  if (input.amount != null && input.amount <= 0) {
    throw new Error("Amount must be positive");
  }
  if (
    input.type != null &&
    input.type !== "DEPOSIT" &&
    input.type !== "WITHDRAWAL"
  ) {
    throw new Error("type must be DEPOSIT or WITHDRAWAL");
  }
  return prisma.cashTransaction.update({
    where: { id },
    data: {
      ...(input.type != null && { type: input.type }),
      ...(input.amount != null && { amount: input.amount }),
      ...(input.executedAt != null && { executedAt: new Date(input.executedAt) }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
}

export async function deleteCashTransaction(id: string) {
  return prisma.cashTransaction.delete({ where: { id } });
}
