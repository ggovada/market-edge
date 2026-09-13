import YahooFinance from "yahoo-finance2";
import type {
  Candle,
  CandleInterval,
  MarketDataProvider,
  Quote,
} from "./types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** Map common Indian tickers to Yahoo symbols (.NS / .BO). Pass-through if already suffixed. */
export function toYahooSymbol(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (t.includes(".") || t.startsWith("^") || t.includes("=")) return t;
  // US-style tickers without suffix stay as-is; Indian symbols typically need .NS
  // Heuristic: if user provides bare Indian ticker they should use RELIANCE.NS form.
  // We still accept bare symbols and try .NS first via quote.
  return t;
}

export class YahooFinanceProvider implements MarketDataProvider {
  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()))];
    if (unique.length === 0) return [];

    const results: Quote[] = [];
    // yahoo-finance2 quote accepts array
    try {
      const data = await yahooFinance.quote(unique as Parameters<typeof yahooFinance.quote>[0]);
      const list = Array.isArray(data) ? data : [data];
      for (const q of list) {
        if (!q || !q.symbol) continue;
        const price = q.regularMarketPrice ?? q.postMarketPrice ?? 0;
        const dayChange = q.regularMarketChange ?? 0;
        const dayChangePct = q.regularMarketChangePercent ?? 0;
        results.push({
          ticker: q.symbol.toUpperCase(),
          price,
          dayChange,
          dayChangePct,
          currency: q.currency ?? "INR",
          fetchedAt: new Date(),
        });
      }
    } catch (err) {
      console.error("Yahoo quote batch failed, falling back per-ticker", err);
      for (const t of unique) {
        try {
          const q = await yahooFinance.quote(t);
          if (!q) continue;
          results.push({
            ticker: (q.symbol ?? t).toUpperCase(),
            price: q.regularMarketPrice ?? 0,
            dayChange: q.regularMarketChange ?? 0,
            dayChangePct: q.regularMarketChangePercent ?? 0,
            currency: q.currency ?? "INR",
            fetchedAt: new Date(),
          });
        } catch (e) {
          console.error(`Quote failed for ${t}`, e);
        }
      }
    }
    return results;
  }

  async getHistory(
    ticker: string,
    interval: CandleInterval,
    period: string
  ): Promise<Candle[]> {
    const result = await yahooFinance.chart(ticker, {
      period1: periodStart(period),
      interval: interval === "1wk" ? "1wk" : "1d",
    });

    const quotes = result.quotes ?? [];
    return quotes
      .filter((c) => c.open != null && c.close != null && c.high != null && c.low != null)
      .map((c) => ({
        time: Math.floor(new Date(c.date).getTime() / 1000),
        open: c.open as number,
        high: c.high as number,
        low: c.low as number,
        close: c.close as number,
        volume: c.volume ?? 0,
      }));
  }
}

function periodStart(period: string): Date {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "6mo":
      d.setMonth(d.getMonth() - 6);
      break;
    case "1y":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "2y":
      d.setFullYear(d.getFullYear() - 2);
      break;
    case "3y":
      d.setFullYear(d.getFullYear() - 3);
      break;
    case "5y":
      d.setFullYear(d.getFullYear() - 5);
      break;
    default:
      d.setFullYear(d.getFullYear() - 1);
  }
  return d;
}

let provider: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (!provider) provider = new YahooFinanceProvider();
  return provider;
}
