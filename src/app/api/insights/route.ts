import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMarketDataProvider } from "@/lib/market/yahoo";
import { computeSupportResistance, summarizePriceAction } from "@/lib/technical/levels";
import { narrateLevels } from "@/lib/ai/insights";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();
  const timeframe = (searchParams.get("timeframe") ?? "DAILY").toUpperCase() as
    | "DAILY"
    | "WEEKLY";
  const force = searchParams.get("force") === "1";

  if (!ticker) {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }

  const cached = await prisma.technicalInsight.findUnique({
    where: { ticker_timeframe: { ticker, timeframe } },
  });

  const maxAge = 6 * 60 * 60 * 1000; // 6 hours
  if (
    !force &&
    cached &&
    Date.now() - cached.generatedAt.getTime() < maxAge
  ) {
    return NextResponse.json({
      ticker,
      timeframe,
      levels: JSON.parse(cached.levels),
      aiNarrative: cached.aiNarrative,
      generatedAt: cached.generatedAt,
      cached: true,
    });
  }

  try {
    const provider = getMarketDataProvider();
    const interval = timeframe === "WEEKLY" ? "1wk" : "1d";
    const period = timeframe === "WEEKLY" ? "3y" : "1y";
    const candles = await provider.getHistory(ticker, interval, period);
    const levels = computeSupportResistance(candles, {
      window: timeframe === "WEEKLY" ? 3 : 5,
    });
    const summary = summarizePriceAction(candles);
    const aiNarrative = await narrateLevels({
      ticker,
      timeframe,
      levels,
      summary,
    });

    const saved = await prisma.technicalInsight.upsert({
      where: { ticker_timeframe: { ticker, timeframe } },
      create: {
        ticker,
        timeframe,
        levels: JSON.stringify(levels),
        aiNarrative,
        generatedAt: new Date(),
      },
      update: {
        levels: JSON.stringify(levels),
        aiNarrative,
        generatedAt: new Date(),
      },
    });

    return NextResponse.json({
      ticker,
      timeframe,
      levels,
      aiNarrative,
      summary,
      generatedAt: saved.generatedAt,
      cached: false,
      disclaimer:
        "Informational technical analysis only — not financial advice.",
    });
  } catch (e) {
    console.error(e);
    if (cached) {
      return NextResponse.json({
        ticker,
        timeframe,
        levels: JSON.parse(cached.levels),
        aiNarrative: cached.aiNarrative,
        generatedAt: cached.generatedAt,
        cached: true,
        stale: true,
      });
    }
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 502 });
  }
}
