import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type NewsItem = {
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
};

function toIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

function nameTokens(name: string, ticker: string): string[] {
  const base = ticker.split(".")[0].toLowerCase();
  const cleaned = name
    .replace(/\b(ltd|limited|inc|corp|corporation|plc|co)\b\.?/gi, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned
    .split(" ")
    .map((p) => p.toLowerCase())
    .filter((p) => p.length >= 3);
  const tokens = new Set<string>([base, ...parts.slice(0, 3)]);
  // Common Indian aliases
  if (base === "reliance" || parts.includes("reliance")) {
    tokens.add("jio");
    tokens.add("ril");
  }
  return [...tokens];
}

function titleMatches(title: string, tokens: string[]) {
  const t = title.toLowerCase();
  return tokens.some((tok) => t.includes(tok));
}

/**
 * Latest headlines for a ticker via Yahoo search, filtered to the company.
 */
export async function getTickerNews(ticker: string, limit = 3): Promise<NewsItem[]> {
  const symbol = ticker.trim().toUpperCase();
  let displayName = symbol.split(".")[0];

  try {
    const q = await yahooFinance.quote(symbol);
    displayName = q.shortName || q.longName || displayName;
  } catch {
    // fall through with symbol base
  }

  const tokens = nameTokens(displayName, symbol);
  const queries = [
    displayName.replace(/\b(ltd|limited)\b\.?/gi, "").trim(),
    symbol.split(".")[0],
  ].filter(Boolean);

  const seen = new Set<string>();
  const collected: NewsItem[] = [];

  for (const query of queries) {
    if (collected.length >= limit) break;
    try {
      const result = await yahooFinance.search(query, {
        newsCount: 12,
        quotesCount: 1,
      });
      for (const n of result.news ?? []) {
        if (!n.title || !n.link) continue;
        if (!titleMatches(n.title, tokens)) continue;
        const key = n.link;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({
          title: n.title,
          url: n.link,
          publisher: n.publisher || "Yahoo Finance",
          publishedAt: toIso(n.providerPublishTime),
        });
        if (collected.length >= limit) break;
      }
    } catch (err) {
      console.error("News search failed", query, err);
    }
  }

  // Fallback: significant developments from Yahoo insights (no URL)
  if (collected.length < limit) {
    try {
      const insights = await yahooFinance.insights(symbol);
      for (const d of insights.sigDevs ?? []) {
        if (!d.headline) continue;
        const synthetic = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/news`;
        if (seen.has(d.headline)) continue;
        seen.add(d.headline);
        collected.push({
          title: d.headline,
          url: synthetic,
          publisher: "Yahoo Finance",
          publishedAt: d.date ? new Date(d.date).toISOString() : undefined,
        });
        if (collected.length >= limit) break;
      }
    } catch {
      // optional
    }
  }

  return collected.slice(0, limit);
}
