import { NextResponse } from "next/server";
import { getCachedQuotes } from "@/lib/market/quotes";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get("tickers");
  const force = searchParams.get("force") === "1";

  let tickers: string[] = [];
  if (tickersParam) {
    tickers = tickersParam.split(",").map((t) => t.trim()).filter(Boolean);
  } else {
    // All unique tickers from open lots
    const lots = await prisma.lot.findMany({
      where: { quantityRemaining: { gt: 0 } },
      select: { ticker: true },
      distinct: ["ticker"],
    });
    tickers = lots.map((l) => l.ticker);
  }

  const quotes = await getCachedQuotes(tickers, { force });
  return NextResponse.json({
    quotes,
    refreshedAt: new Date().toISOString(),
  });
}
