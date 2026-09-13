import type { TickerSearchHit } from "./search";

const FYERS_FO_URL =
  "https://public.fyers.in/sym_details/NSE_FO_sym_master.json";

/** Refresh the in-memory master this often so new expiries appear automatically. */
const CACHE_TTL_MS = Number(
  process.env.FYERS_FO_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000
);

type FyersFoRow = {
  underSym?: string;
  exSymbol?: string;
  exSymName?: string;
  symDetails?: string;
  optType?: string;
  strikePrice?: number;
  minLotSize?: number;
  expiryDate?: string | number;
  exchange?: number;
  segment?: number;
};

type CachedContract = {
  symbol: string;
  underlying: string;
  name: string;
  lotSize: number;
  expiryMs: number;
  searchText: string;
};

type CacheState = {
  fetchedAt: number;
  contracts: CachedContract[];
};

let cache: CacheState | null = null;
let inflight: Promise<CacheState> | null = null;

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function expiryMs(raw: string | number | undefined): number {
  if (raw == null || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Fyers sends epoch seconds
  return n > 1e12 ? n : n * 1000;
}

function formatExpiry(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const mon = MONTHS[d.getUTCMonth()] ?? "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${day}-${mon}-${yy}`;
}

function isFuturesRow(symbol: string, row: FyersFoRow): boolean {
  if (!symbol.toUpperCase().endsWith("FUT")) return false;
  if (row.optType && row.optType !== "XX") return false;
  if (row.strikePrice != null && row.strikePrice > 0) return false;
  return true;
}

async function downloadMaster(): Promise<CacheState> {
  const res = await fetch(FYERS_FO_URL, {
    headers: { Accept: "application/json,text/plain,*/*" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Fyers FO master HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<string, FyersFoRow>;
  const contracts: CachedContract[] = [];

  for (const [symbol, row] of Object.entries(data)) {
    if (!row || !isFuturesRow(symbol, row)) continue;
    const underlying = (row.underSym || row.exSymbol || "").toUpperCase();
    if (!underlying) continue;
    const lotSize = Math.max(1, Number(row.minLotSize) || 1);
    const exp = expiryMs(row.expiryDate);
    const expLabel = formatExpiry(exp);
    const name = expLabel
      ? `${underlying} ${expLabel} FUT`
      : row.exSymName || row.symDetails || symbol;
    contracts.push({
      symbol: symbol.toUpperCase(),
      underlying,
      name,
      lotSize,
      expiryMs: exp,
      searchText: `${symbol} ${underlying} ${name} ${row.exSymName ?? ""}`.toUpperCase(),
    });
  }

  contracts.sort((a, b) => {
    if (a.underlying !== b.underlying) {
      return a.underlying.localeCompare(b.underlying);
    }
    return a.expiryMs - b.expiryMs;
  });

  return { fetchedAt: Date.now(), contracts };
}

async function getMaster(force = false): Promise<CacheState> {
  if (
    !force &&
    cache &&
    Date.now() - cache.fetchedAt < CACHE_TTL_MS
  ) {
    return cache;
  }
  if (!force && inflight) return inflight;

  inflight = downloadMaster()
    .then((next) => {
      cache = next;
      return next;
    })
    .finally(() => {
      inflight = null;
    });

  try {
    return await inflight;
  } catch (err) {
    if (cache) {
      console.error("Fyers FO refresh failed; using stale cache", err);
      return cache;
    }
    throw err;
  }
}

export async function searchFyersFutures(
  query: string,
  limit = 12
): Promise<(TickerSearchHit & { lotSize: number; expiry?: string })[]> {
  const q = query.trim().toUpperCase();
  if (q.length < 1) return [];

  const { contracts } = await getMaster();
  const now = Date.now() - 24 * 60 * 60 * 1000; // keep today-expiring briefly
  const hits: (TickerSearchHit & { lotSize: number; expiry?: string })[] = [];

  for (const c of contracts) {
    if (c.expiryMs && c.expiryMs < now) continue;
    if (!c.searchText.includes(q) && !c.underlying.startsWith(q)) continue;
    hits.push({
      symbol: c.symbol,
      name: c.name,
      type: "Futures",
      exchange: "NSE FO",
      source: "fyers",
      lotSize: c.lotSize,
      expiry: formatExpiry(c.expiryMs) || undefined,
    });
    if (hits.length >= limit) break;
  }

  // Prefer exact underlying match + nearer expiry
  hits.sort((a, b) => {
    const aExact = a.name.startsWith(q) || a.symbol.includes(`:${q}`) ? 0 : 1;
    const bExact = b.name.startsWith(q) || b.symbol.includes(`:${q}`) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return 0;
  });

  return hits.slice(0, limit);
}

export async function lookupFyersLotSize(
  symbol: string
): Promise<number | null> {
  const key = symbol.trim().toUpperCase();
  const { contracts } = await getMaster();
  const hit = contracts.find((c) => c.symbol === key);
  return hit?.lotSize ?? null;
}

/** Force refresh (e.g. admin/debug). Returns contract count. */
export async function refreshFyersFoMaster(): Promise<number> {
  const next = await getMaster(true);
  return next.contracts.length;
}
