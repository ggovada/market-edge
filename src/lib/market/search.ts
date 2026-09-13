import YahooFinance from "yahoo-finance2";
import { matchFuturesCatalog } from "./futures-catalog";
import { searchFyersFutures } from "./fyers-fo";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type TickerSearchHit = {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  source: "yahoo" | "catalog" | "fyers";
  lotSize?: number;
  expiry?: string;
};

type InstrumentFilter = "EQUITY" | "FUTURES" | "ALL";

function typeLabel(quoteType: string | undefined, typeDisp?: string): string {
  if (typeDisp) return typeDisp;
  switch ((quoteType ?? "").toUpperCase()) {
    case "EQUITY":
      return "Stock";
    case "FUTURE":
      return "Futures";
    case "ETF":
      return "ETF";
    case "INDEX":
      return "Index";
    default:
      return quoteType || "Other";
  }
}

function preferIndianEquity(a: TickerSearchHit, b: TickerSearchHit): number {
  const rank = (h: TickerSearchHit) => {
    if (h.symbol.endsWith(".NS")) return 0;
    if (h.symbol.endsWith(".BO")) return 1;
    if (h.type === "Stock" || h.type === "EQUITY") return 2;
    return 3;
  };
  return rank(a) - rank(b);
}

export async function searchTickers(
  query: string,
  instrument: InstrumentFilter = "ALL"
): Promise<TickerSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const hits: TickerSearchHit[] = [];
  const seen = new Set<string>();

  function push(hit: TickerSearchHit) {
    const key = hit.symbol.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  }

  // Indian NSE F&O contracts from Fyers public master (primary for futures)
  if (instrument === "FUTURES" || instrument === "ALL") {
    try {
      const fyersHits = await searchFyersFutures(q, 12);
      for (const hit of fyersHits) push(hit);
    } catch (err) {
      console.error("Fyers FO search failed", err);
    }
  }

  // Curated Yahoo continuous futures (oil, gold, etc.) as extras
  if (instrument === "FUTURES" || instrument === "ALL") {
    for (const item of matchFuturesCatalog(q)) {
      push({
        symbol: item.symbol,
        name: item.name,
        type: "Futures",
        exchange: item.exchange,
        source: "catalog",
        lotSize: 1,
      });
    }
  }

  if (instrument === "FUTURES") {
    return hits.slice(0, 12);
  }

  const queries = [q];

  for (const searchQ of queries) {
    try {
      const result = await yahooFinance.search(searchQ, {
        quotesCount: 12,
        newsCount: 0,
      });
      for (const row of result.quotes ?? []) {
        const symbol =
          typeof row.symbol === "string" ? row.symbol.trim() : "";
        if (!symbol) continue;
        const quoteType =
          "quoteType" in row && typeof row.quoteType === "string"
            ? row.quoteType
            : "";
        const typeDisp =
          "typeDisp" in row && typeof row.typeDisp === "string"
            ? row.typeDisp
            : undefined;
        const shortname =
          "shortname" in row && typeof row.shortname === "string"
            ? row.shortname
            : "";
        const longname =
          "longname" in row && typeof row.longname === "string"
            ? row.longname
            : "";
        const exchDisp =
          "exchDisp" in row && typeof row.exchDisp === "string"
            ? row.exchDisp
            : "";
        const exchange =
          "exchange" in row && typeof row.exchange === "string"
            ? row.exchange
            : "";
        const qt = quoteType.toUpperCase();
        if (instrument === "EQUITY") {
          if (qt === "FUTURE" || qt === "OPTION" || qt === "CRYPTOCURRENCY")
            continue;
        }
        push({
          symbol: symbol.toUpperCase(),
          name: shortname || longname || symbol,
          type: typeLabel(quoteType, typeDisp),
          exchange: exchDisp || exchange,
          source: "yahoo",
        });
      }
    } catch (err) {
      console.error("Yahoo search failed", searchQ, err);
    }
  }

  if (instrument === "EQUITY") {
    hits.sort(preferIndianEquity);
  }

  return hits.slice(0, 12);
}
