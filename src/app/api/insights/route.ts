import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMarketDataProvider } from "@/lib/market/yahoo";
import { getTickerNews } from "@/lib/market/news";
import { getOutletSignals } from "@/lib/market/signals";
import {
  computeSupportResistance,
  summarizePriceAction,
} from "@/lib/technical/levels";
import {
  buildInsightBrief,
  parseBrief,
  serializeBrief,
} from "@/lib/ai/insights";

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
    const brief = parseBrief(cached.aiNarrative);
    // Refresh news/signals even when levels are cached (they're more time-sensitive)
    const [news, signals] = await Promise.all([
      getTickerNews(ticker, 3).catch(() => brief?.news ?? []),
      getOutletSignals(ticker, 5).catch(() => brief?.signals ?? []),
    ]);
    const levels = JSON.parse(cached.levels);
    return NextResponse.json({
      ticker,
      timeframe,
      levels,
      bullets: brief?.bullets ?? [],
      news,
      signals,
      aiNarrative: cached.aiNarrative,
      generatedAt: cached.generatedAt,
      cached: true,
      disclaimer:
        "Informational only — not financial advice. Levels and ratings can be wrong or delayed.",
    });
  }

  try {
    const provider = getMarketDataProvider();
    const interval = timeframe === "WEEKLY" ? "1wk" : "1d";
    const period = timeframe === "WEEKLY" ? "3y" : "1y";
    const candles = await provider.getHistory(ticker, interval, period);
    const levels = computeSupportResistance(candles, {
      window: timeframe === "WEEKLY" ? 3 : 7,
    });
    const summary = summarizePriceAction(candles);

    const [news, signals] = await Promise.all([
      getTickerNews(ticker, 3),
      getOutletSignals(ticker, 5),
    ]);

    const brief = buildInsightBrief({
      ticker,
      timeframe,
      levels,
      summary,
      news,
      signals,
    });
    const aiNarrative = serializeBrief(brief);

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
      bullets: brief.bullets,
      news: brief.news,
      signals: brief.signals,
      summary,
      aiNarrative,
      generatedAt: saved.generatedAt,
      cached: false,
      disclaimer:
        "Informational only — not financial advice. Levels and ratings can be wrong or delayed.",
    });
  } catch (e) {
    console.error(e);
    if (cached) {
      const brief = parseBrief(cached.aiNarrative);
      return NextResponse.json({
        ticker,
        timeframe,
        levels: JSON.parse(cached.levels),
        bullets: brief?.bullets ?? [],
        news: brief?.news ?? [],
        signals: brief?.signals ?? [],
        aiNarrative: cached.aiNarrative,
        generatedAt: cached.generatedAt,
        cached: true,
        stale: true,
      });
    }
    return NextResponse.json({ error: "Failed to generate insights" }, { status: 502 });
  }
}
