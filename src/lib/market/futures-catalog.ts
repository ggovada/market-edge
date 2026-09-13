/** Popular Yahoo Finance futures with searchable names (continuous front-month). */
export type CatalogFuture = {
  symbol: string;
  name: string;
  exchange: string;
  keywords: string[];
};

export const FUTURES_CATALOG: CatalogFuture[] = [
  {
    symbol: "ES=F",
    name: "E-Mini S&P 500",
    exchange: "CME",
    keywords: ["sp500", "s&p", "s&p 500", "emini", "e-mini", "es"],
  },
  {
    symbol: "NQ=F",
    name: "Nasdaq 100",
    exchange: "CME",
    keywords: ["nasdaq", "ndx", "tech", "nq"],
  },
  {
    symbol: "YM=F",
    name: "Mini Dow Jones",
    exchange: "CBOT",
    keywords: ["dow", "djia", "ym"],
  },
  {
    symbol: "RTY=F",
    name: "E-mini Russell 2000",
    exchange: "CME",
    keywords: ["russell", "rty", "small cap"],
  },
  {
    symbol: "CL=F",
    name: "Crude Oil (WTI)",
    exchange: "NYMEX",
    keywords: ["crude", "oil", "wti", "cl", "petroleum"],
  },
  {
    symbol: "BZ=F",
    name: "Brent Crude Oil",
    exchange: "NYMEX",
    keywords: ["brent", "crude", "oil"],
  },
  {
    symbol: "NG=F",
    name: "Natural Gas",
    exchange: "NYMEX",
    keywords: ["gas", "natgas", "ng"],
  },
  {
    symbol: "GC=F",
    name: "Gold",
    exchange: "COMEX",
    keywords: ["gold", "gc", "bullion"],
  },
  {
    symbol: "SI=F",
    name: "Silver",
    exchange: "COMEX",
    keywords: ["silver", "si"],
  },
  {
    symbol: "HG=F",
    name: "Copper",
    exchange: "COMEX",
    keywords: ["copper", "hg"],
  },
  {
    symbol: "ZC=F",
    name: "Corn",
    exchange: "CBOT",
    keywords: ["corn", "zc"],
  },
  {
    symbol: "ZS=F",
    name: "Soybeans",
    exchange: "CBOT",
    keywords: ["soy", "soybean", "zs"],
  },
  {
    symbol: "ZW=F",
    name: "Wheat",
    exchange: "CBOT",
    keywords: ["wheat", "zw"],
  },
  {
    symbol: "6E=F",
    name: "Euro FX",
    exchange: "CME",
    keywords: ["euro", "eur", "fx", "currency"],
  },
  {
    symbol: "6J=F",
    name: "Japanese Yen",
    exchange: "CME",
    keywords: ["yen", "jpy", "fx"],
  },
  {
    symbol: "BTC=F",
    name: "Bitcoin",
    exchange: "CME",
    keywords: ["bitcoin", "btc", "crypto"],
  },
  {
    symbol: "ETH=F",
    name: "Ether",
    exchange: "CME",
    keywords: ["ether", "ethereum", "eth", "crypto"],
  },
];

export function matchFuturesCatalog(query: string): CatalogFuture[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  return FUTURES_CATALOG.filter((item) => {
    if (item.symbol.toLowerCase().includes(q)) return true;
    if (item.name.toLowerCase().includes(q)) return true;
    return item.keywords.some((k) => k.includes(q) || q.includes(k));
  });
}
