import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createTrade, updateTrade, softDeleteTrade, importTradesCsv } from "@/lib/trades/service";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get("portfolioId");
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 });
  }
  const trades = await prisma.trade.findMany({
    where: { portfolioId, deletedAt: null },
    orderBy: { executedAt: "desc" },
  });
  return NextResponse.json(trades);
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.bulk && Array.isArray(body.rows)) {
    if (!body.portfolioId) {
      return NextResponse.json({ error: "portfolioId required" }, { status: 400 });
    }
    const created = await importTradesCsv(body.portfolioId, body.rows);
    return NextResponse.json({ imported: created.length, trades: created }, { status: 201 });
  }

  if (!body.portfolioId || !body.ticker || !body.action || !body.quantity || !body.pricePerShare || !body.executedAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (body.action !== "BUY" && body.action !== "SELL") {
    return NextResponse.json({ error: "action must be BUY or SELL" }, { status: 400 });
  }
  if (Number(body.quantity) <= 0 || Number(body.pricePerShare) < 0) {
    return NextResponse.json({ error: "Invalid quantity/price" }, { status: 400 });
  }

  try {
    const trade = await createTrade({
      portfolioId: body.portfolioId,
      ticker: body.ticker,
      action: body.action,
      instrumentType: body.instrumentType === "FUTURES" ? "FUTURES" : "EQUITY",
      quantity: Number(body.quantity),
      pricePerShare: Number(body.pricePerShare),
      fees: body.fees != null ? Number(body.fees) : 0,
      executedAt: body.executedAt,
      notes: body.notes,
    });
    return NextResponse.json(trade, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to create trade" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const trade = await updateTrade(body.id, body);
    return NextResponse.json(trade);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const trade = await softDeleteTrade(id);
  return NextResponse.json(trade);
}
