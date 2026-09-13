import { prisma } from "@/lib/db";
import { getMarketDataProvider } from "@/lib/market/yahoo";
import type { Quote } from "@/lib/market/types";

const DEFAULT_TTL = Number(process.env.QUOTE_CACHE_TTL_SECONDS ?? 20);

export async function getCachedQuotes(
  tickers: string[],
  opts?: { force?: boolean; ttlSeconds?: number }
): Promise<Quote[]> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return [];

  const ttl = (opts?.ttlSeconds ?? DEFAULT_TTL) * 1000;
  const now = Date.now();

  const cached = await prisma.priceSnapshot.findMany({
    where: { ticker: { in: unique } },
  });
  const cacheMap = new Map(cached.map((c) => [c.ticker, c]));

  const fresh: Quote[] = [];
  const stale: string[] = [];

  for (const t of unique) {
    const hit = cacheMap.get(t);
    if (
      !opts?.force &&
      hit &&
      now - hit.fetchedAt.getTime() < ttl
    ) {
      fresh.push({
        ticker: hit.ticker,
        price: hit.price,
        dayChange: hit.dayChange,
        dayChangePct: hit.dayChangePct,
        currency: hit.currency,
        fetchedAt: hit.fetchedAt,
      });
    } else {
      stale.push(t);
    }
  }

  if (stale.length > 0) {
    try {
      const provider = getMarketDataProvider();
      const quotes = await provider.getQuotes(stale);
      for (const q of quotes) {
        await prisma.priceSnapshot.upsert({
          where: { ticker: q.ticker },
          create: {
            ticker: q.ticker,
            price: q.price,
            dayChange: q.dayChange,
            dayChangePct: q.dayChangePct,
            currency: q.currency,
            fetchedAt: q.fetchedAt,
            stale: false,
          },
          update: {
            price: q.price,
            dayChange: q.dayChange,
            dayChangePct: q.dayChangePct,
            currency: q.currency,
            fetchedAt: q.fetchedAt,
            stale: false,
          },
        });
        fresh.push(q);
      }

      // For tickers that failed, return last cached with stale flag
      const got = new Set(quotes.map((q) => q.ticker));
      for (const t of stale) {
        if (got.has(t)) continue;
        const hit = cacheMap.get(t);
        if (hit) {
          await prisma.priceSnapshot.update({
            where: { ticker: t },
            data: { stale: true },
          });
          fresh.push({
            ticker: hit.ticker,
            price: hit.price,
            dayChange: hit.dayChange,
            dayChangePct: hit.dayChangePct,
            currency: hit.currency,
            fetchedAt: hit.fetchedAt,
          });
        }
      }
    } catch (err) {
      console.error("Quote refresh failed, using cache", err);
      for (const t of stale) {
        const hit = cacheMap.get(t);
        if (hit) {
          fresh.push({
            ticker: hit.ticker,
            price: hit.price,
            dayChange: hit.dayChange,
            dayChangePct: hit.dayChangePct,
            currency: hit.currency,
            fetchedAt: hit.fetchedAt,
          });
        }
      }
    }
  }

  return fresh;
}
