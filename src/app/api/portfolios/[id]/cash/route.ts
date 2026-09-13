import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createCashTransaction,
  deleteCashTransaction,
  getPortfolioCashBreakdown,
  updateCashTransaction,
} from "@/lib/portfolio/cash";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const portfolio = await prisma.portfolio.findUnique({ where: { id } });
  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const breakdown = await getPortfolioCashBreakdown(id);
  return NextResponse.json(breakdown);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const portfolio = await prisma.portfolio.findUnique({ where: { id } });
  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const type = String(body.type ?? "").toUpperCase();
  if (type !== "DEPOSIT" && type !== "WITHDRAWAL") {
    return NextResponse.json(
      { error: "type must be DEPOSIT or WITHDRAWAL" },
      { status: 400 }
    );
  }
  const amount = Number(body.amount);
  if (!(amount > 0)) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }

  try {
    const txn = await createCashTransaction({
      portfolioId: id,
      type,
      amount,
      executedAt: body.executedAt ?? new Date().toISOString(),
      notes: body.notes,
    });
    const breakdown = await getPortfolioCashBreakdown(id);
    return NextResponse.json({ transaction: txn, ...breakdown }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: portfolioId } = await ctx.params;
  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.cashTransaction.findFirst({
    where: { id: body.id, portfolioId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const type =
    body.type != null ? String(body.type).toUpperCase() : undefined;
  if (type != null && type !== "DEPOSIT" && type !== "WITHDRAWAL") {
    return NextResponse.json(
      { error: "type must be DEPOSIT or WITHDRAWAL" },
      { status: 400 }
    );
  }
  if (body.amount != null && !(Number(body.amount) > 0)) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }

  try {
    const txn = await updateCashTransaction(body.id, {
      type: type as "DEPOSIT" | "WITHDRAWAL" | undefined,
      amount: body.amount != null ? Number(body.amount) : undefined,
      executedAt: body.executedAt,
      notes: body.notes,
    });
    const breakdown = await getPortfolioCashBreakdown(portfolioId);
    return NextResponse.json({ transaction: txn, ...breakdown });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id: portfolioId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const txnId = searchParams.get("txnId");
  if (!txnId) {
    return NextResponse.json({ error: "txnId required" }, { status: 400 });
  }
  const existing = await prisma.cashTransaction.findFirst({
    where: { id: txnId, portfolioId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteCashTransaction(txnId);
  const breakdown = await getPortfolioCashBreakdown(portfolioId);
  return NextResponse.json(breakdown);
}
