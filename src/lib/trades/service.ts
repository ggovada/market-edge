import { prisma } from "@/lib/db";
import { rebuildPortfolioLots } from "@/lib/tax/engine";
import { normalizeTicker } from "@/lib/utils";

export type TradeInput = {
  portfolioId: string;
  ticker: string;
  action: "BUY" | "SELL";
  instrumentType?: "EQUITY" | "FUTURES";
  quantity: number;
  pricePerShare: number;
  fees?: number;
  executedAt: Date | string;
  notes?: string;
};

async function audit(
  tradeId: string | null,
  portfolioId: string,
  action: string,
  snapshot: unknown
) {
  await prisma.tradeAuditLog.create({
    data: {
      tradeId,
      portfolioId,
      action,
      snapshot: JSON.stringify(snapshot),
    },
  });
}

export async function createTrade(input: TradeInput) {
  const trade = await prisma.trade.create({
    data: {
      portfolioId: input.portfolioId,
      ticker: normalizeTicker(input.ticker),
      action: input.action,
      instrumentType: input.instrumentType === "FUTURES" ? "FUTURES" : "EQUITY",
      quantity: input.quantity,
      pricePerShare: input.pricePerShare,
      fees: input.fees ?? 0,
      executedAt: new Date(input.executedAt),
      notes: input.notes,
    },
  });
  await audit(trade.id, trade.portfolioId, "CREATE", trade);
  await rebuildPortfolioLots(trade.portfolioId);
  return trade;
}

export async function updateTrade(id: string, input: Partial<TradeInput>) {
  const existing = await prisma.trade.findUniqueOrThrow({ where: { id } });
  if (existing.deletedAt) throw new Error("Cannot edit a deleted trade");

  const trade = await prisma.trade.update({
    where: { id },
    data: {
      ...(input.ticker != null && { ticker: normalizeTicker(input.ticker) }),
      ...(input.action != null && { action: input.action }),
      ...(input.instrumentType != null && {
        instrumentType: input.instrumentType === "FUTURES" ? "FUTURES" : "EQUITY",
      }),
      ...(input.quantity != null && { quantity: input.quantity }),
      ...(input.pricePerShare != null && { pricePerShare: input.pricePerShare }),
      ...(input.fees != null && { fees: input.fees }),
      ...(input.executedAt != null && { executedAt: new Date(input.executedAt) }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
  await audit(trade.id, trade.portfolioId, "UPDATE", { before: existing, after: trade });
  await rebuildPortfolioLots(trade.portfolioId);
  return trade;
}

export async function softDeleteTrade(id: string) {
  const existing = await prisma.trade.findUniqueOrThrow({ where: { id } });
  const trade = await prisma.trade.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await audit(trade.id, trade.portfolioId, "SOFT_DELETE", existing);
  await rebuildPortfolioLots(trade.portfolioId);
  return trade;
}

export async function importTradesCsv(
  portfolioId: string,
  rows: {
    ticker: string;
    action: string;
    instrumentType?: string;
    quantity: number;
    pricePerShare: number;
    fees?: number;
    executedAt: string;
    notes?: string;
  }[]
) {
  const created = [];
  for (const row of rows) {
    const action = row.action.toUpperCase();
    if (action !== "BUY" && action !== "SELL") continue;
    const instrumentType =
      (row.instrumentType ?? "").toUpperCase() === "FUTURES" ? "FUTURES" : "EQUITY";
    const trade = await prisma.trade.create({
      data: {
        portfolioId,
        ticker: normalizeTicker(row.ticker),
        action,
        instrumentType,
        quantity: Number(row.quantity),
        pricePerShare: Number(row.pricePerShare),
        fees: Number(row.fees ?? 0),
        executedAt: new Date(row.executedAt),
        notes: row.notes,
      },
    });
    await audit(trade.id, portfolioId, "CREATE", { ...trade, source: "csv" });
    created.push(trade);
  }
  await rebuildPortfolioLots(portfolioId);
  return created;
}
