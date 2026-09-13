import type { PivotLevel } from "@/lib/technical/levels";
import { buildZoneBullets } from "@/lib/technical/levels";
import type { NewsItem } from "@/lib/market/news";
import type { OutletSignal } from "@/lib/market/signals";

export type InsightBrief = {
  version: 2;
  bullets: string[];
  news: NewsItem[];
  signals: OutletSignal[];
};

export function buildInsightBrief(params: {
  ticker: string;
  timeframe: "DAILY" | "WEEKLY";
  levels: PivotLevel[];
  summary: {
    lastClose: number;
    change30d: number;
    change90d: number;
    high52?: number;
    low52?: number;
    trend: string;
  };
  news: NewsItem[];
  signals: OutletSignal[];
}): InsightBrief {
  void params.timeframe;
  return {
    version: 2,
    bullets: buildZoneBullets({
      ticker: params.ticker,
      levels: params.levels,
      summary: params.summary,
    }),
    news: params.news,
    signals: params.signals,
  };
}

export function serializeBrief(brief: InsightBrief): string {
  return JSON.stringify(brief);
}

export function parseBrief(raw: string | null | undefined): InsightBrief | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as InsightBrief;
    if (parsed?.version === 2 && Array.isArray(parsed.bullets)) return parsed;
  } catch {
    // legacy prose narrative
  }
  return null;
}

/** @deprecated Prefer structured InsightBrief bullets */
export async function narrateLevels(params: {
  ticker: string;
  timeframe: "DAILY" | "WEEKLY";
  levels: PivotLevel[];
  summary: {
    lastClose: number;
    change30d: number;
    change90d: number;
    high52?: number;
    low52?: number;
    trend: string;
  };
}): Promise<string> {
  return serializeBrief(
    buildInsightBrief({
      ...params,
      news: [],
      signals: [],
    })
  );
}
