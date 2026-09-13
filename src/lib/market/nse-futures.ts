import type { Quote } from "./types";

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

/** NSE:RELIANCE26SEPFUT or RELIANCE26SEPFUT */
const FO_SYM_RE =
  /^(?:NSE:)?([A-Z0-9]+)(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)FUT$/i;

export function isNseFoTicker(ticker: string): boolean {
  return FO_SYM_RE.test(ticker.trim().toUpperCase());
}

export function parseNseFoTicker(ticker: string): {
  underlying: string;
  year: number;
  month: number; // 0-11
} | null {
  const m = ticker.trim().toUpperCase().match(FO_SYM_RE);
  if (!m) return null;
  const yy = Number(m[2]);
  const month = MONTHS[m[3]];
  if (month == null) return null;
  return {
    underlying: m[1],
    year: 2000 + yy,
    month,
  };
}

type NseDerivRow = {
  identifier?: string;
  instrumentType?: string;
  expiryDate?: string;
  lastPrice?: number;
  change?: number;
  pChange?: number;
  underlying?: string;
  contract?: string;
};

let cookieCache: { cookie: string; fetchedAt: number } | null = null;

async function nseHeaders(): Promise<HeadersInit> {
  const now = Date.now();
  if (!cookieCache || now - cookieCache.fetchedAt > 10 * 60 * 1000) {
    const home = await fetch("https://www.nseindia.com", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const parts =
      typeof home.headers.getSetCookie === "function"
        ? home.headers.getSetCookie()
        : [];
    cookieCache = {
      cookie: parts.map((c) => c.split(";")[0]).join("; "),
      fetchedAt: now,
    };
  }
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    Referer: "https://www.nseindia.com/option-chain",
    Cookie: cookieCache.cookie,
  };
}

function parseNseExpiry(expiryDate: string): { year: number; month: number } | null {
  // "29-Sep-2026"
  const m = expiryDate.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toUpperCase()];
  if (month == null) return null;
  return { year: Number(m[3]), month };
}

function matchesContract(
  row: NseDerivRow,
  parsed: { underlying: string; year: number; month: number }
): boolean {
  const exp = row.expiryDate ? parseNseExpiry(row.expiryDate) : null;
  if (!exp) return false;
  if (exp.year !== parsed.year || exp.month !== parsed.month) return false;
  const id = (row.identifier || "").toUpperCase();
  const und = (row.underlying || "").toUpperCase();
  const isFut =
    (row.instrumentType || "").includes("FUT") || id.includes("FUT");
  if (!isFut) return false;
  if (und && und !== parsed.underlying) return false;
  if (!und && !id.includes(parsed.underlying)) return false;
  return true;
}

async function fetchDerivativesForUnderlying(
  underlying: string
): Promise<NseDerivRow[]> {
  const headers = await nseHeaders();
  const url = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolDerivativesData&symbol=${encodeURIComponent(underlying)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`NSE derivatives ${underlying}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: NseDerivRow[] };
  return json.data ?? [];
}

async function fetchIndexFutures(underlying: string): Promise<NseDerivRow[]> {
  const headers = await nseHeaders();
  const index =
    underlying === "NIFTY"
      ? "nse50_fut"
      : underlying === "BANKNIFTY"
        ? "banknifty_fut"
        : underlying === "FINNIFTY"
          ? "finnifty_fut"
          : underlying === "MIDCPNIFTY"
            ? "midcpnifty_fut"
            : null;
  if (!index) return [];
  const res = await fetch(
    `https://www.nseindia.com/api/liveEquity-derivatives?index=${index}`,
    { headers }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: NseDerivRow[] };
  return json.data ?? [];
}

export async function getNseFoQuotes(tickers: string[]): Promise<Quote[]> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()))];
  const byUnderlying = new Map<
    string,
    { ticker: string; parsed: NonNullable<ReturnType<typeof parseNseFoTicker>> }[]
  >();

  for (const ticker of unique) {
    const parsed = parseNseFoTicker(ticker);
    if (!parsed) continue;
    const list = byUnderlying.get(parsed.underlying) ?? [];
    list.push({ ticker, parsed });
    byUnderlying.set(parsed.underlying, list);
  }

  const out: Quote[] = [];
  const now = new Date();

  await Promise.all(
    [...byUnderlying.entries()].map(async ([underlying, items]) => {
      try {
        let rows = await fetchDerivativesForUnderlying(underlying);
        if (!rows.length) {
          rows = await fetchIndexFutures(underlying);
        }
        for (const item of items) {
          const row = rows.find((r) => matchesContract(r, item.parsed));
          if (!row || row.lastPrice == null || row.lastPrice <= 0) continue;
          out.push({
            ticker: item.ticker,
            price: row.lastPrice,
            dayChange: row.change ?? 0,
            dayChangePct: row.pChange ?? 0,
            currency: "INR",
            fetchedAt: now,
          });
        }
      } catch (err) {
        console.error(`NSE FO quote failed for ${underlying}`, err);
      }
    })
  );

  return out;
}
