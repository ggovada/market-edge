export type PivotLevel = {
  price: number;
  type: "support" | "resistance";
  touches: number;
  strength: number; // 0-100
  sources: string[];
};

export type CandleInput = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Local maxima/minima over an N-bar window */
export function findSwingPivots(candles: CandleInput[], window = 7) {
  const highs: { price: number; index: number }[] = [];
  const lows: { price: number; index: number }[] = [];

  for (let i = window; i < candles.length - window; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= window; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isLow = false;
      }
    }
    if (isHigh) highs.push({ price: candles[i].high, index: i });
    if (isLow) lows.push({ price: candles[i].low, index: i });
  }
  return { highs, lows };
}

function sma(candles: CandleInput[], period: number): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  return slice.reduce((s, c) => s + c.close, 0) / period;
}

function atr(candles: CandleInput[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prev.close),
        Math.abs(c.low - prev.close)
      )
    );
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function avg(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function roundPrice(price: number, lastClose: number) {
  if (lastClose >= 1000) return Math.round(price * 10) / 10;
  if (lastClose >= 100) return Math.round(price * 100) / 100;
  return Math.round(price * 1000) / 1000;
}

function countTouches(
  candles: CandleInput[],
  zoneLow: number,
  zoneHigh: number
): number {
  let touches = 0;
  for (const c of candles) {
    if (c.low <= zoneHigh && c.high >= zoneLow) touches++;
  }
  return touches;
}

/**
 * Detect flat shelves where several wick lows (or highs) sit in the same band
 * without any one bar being a fractal swing pivot.
 */
function findWickShelves(
  candles: CandleInput[],
  clusterWidth: number,
  side: "low" | "high"
): { price: number; count: number }[] {
  // Prefer recent action — shelves from the last ~60 sessions matter most
  const recent = candles.slice(-Math.min(candles.length, 60));
  const prices = recent
    .map((c) => (side === "low" ? c.low : c.high))
    .sort((a, b) => a - b);

  const groups: { prices: number[] }[] = [];
  for (const p of prices) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(p - avg(last.prices)) <= clusterWidth * 0.6) {
      last.prices.push(p);
    } else {
      groups.push({ prices: [p] });
    }
  }

  return groups
    .filter((g) => g.prices.length >= 3)
    .map((g) => ({
      // For support shelves use a low-biased center (near the wick cluster)
      price:
        side === "low"
          ? g.prices.sort((a, b) => a - b)[Math.floor(g.prices.length * 0.35)]
          : g.prices.sort((a, b) => a - b)[Math.floor(g.prices.length * 0.65)],
      count: g.prices.length,
    }));
}

/**
 * Support/resistance from swing pivots, wick shelves, and volume nodes.
 * Returns nearest meaningful zones (up to 2 supports below + 2 resistances above).
 */
export function computeSupportResistance(
  candles: CandleInput[],
  opts?: { window?: number; clusterPct?: number }
): PivotLevel[] {
  if (candles.length < 30) return [];

  const lastClose = candles[candles.length - 1].close;
  const atrVal = atr(candles, 14) || lastClose * 0.01;
  // Cluster width: ~0.75 ATR, floored so thin markets still merge noise
  const clusterWidth = Math.max(
    atrVal * 0.75,
    lastClose * (opts?.clusterPct ?? 0.006)
  );
  const window = opts?.window ?? 7;
  const lookback = candles.slice(-Math.min(candles.length, 180));

  const { highs, lows } = findSwingPivots(lookback, window);

  type Raw = { price: number; source: string };
  const raw: Raw[] = [
    ...highs.map((h) => ({ price: h.price, source: "swing-high" })),
    ...lows.map((l) => ({ price: l.price, source: "swing-low" })),
  ];

  // Horizontal wick shelves: repeated lows/highs that never form a sharp fractal
  // (e.g. DIVISLAB ~9087 — several similar lows in a row).
  for (const shelf of findWickShelves(lookback, clusterWidth, "low")) {
    raw.push({ price: shelf.price, source: "low-shelf" });
  }
  for (const shelf of findWickShelves(lookback, clusterWidth, "high")) {
    raw.push({ price: shelf.price, source: "high-shelf" });
  }

  // High-volume nodes at typical price (not close — closes scatter noise)
  const volSorted = [...lookback]
    .filter((c) => c.volume > 0)
    .sort((a, b) => b.volume - a.volume);
  const topVol = volSorted.slice(
    0,
    Math.min(8, Math.max(3, Math.floor(lookback.length * 0.04)))
  );
  for (const c of topVol) {
    raw.push({
      price: (c.high + c.low + c.close) / 3,
      source: "volume-node",
    });
  }

  raw.sort((a, b) => a.price - b.price);

  const clusters: { prices: number[]; sources: string[] }[] = [];
  for (const r of raw) {
    const last = clusters[clusters.length - 1];
    const center = last ? avg(last.prices) : 0;
    if (last && Math.abs(r.price - center) <= clusterWidth) {
      last.prices.push(r.price);
      last.sources.push(r.source);
    } else {
      clusters.push({ prices: [r.price], sources: [r.source] });
    }
  }

  const ma50 = sma(lookback, 50);
  const ma200 = sma(lookback, 200);
  const mas = [
    { v: ma50, label: "SMA50" },
    { v: ma200, label: "SMA200" },
  ].filter((m): m is { v: number; label: string } => m.v != null);

  const candidates: PivotLevel[] = [];

  // Only drop levels glued to the last print (not merely "nearby")
  const onPriceEps = Math.min(atrVal * 0.2, lastClose * 0.0025);

  for (const c of clusters) {
    const price = avg(c.prices);
    if (Math.abs(price - lastClose) < onPriceEps) continue;

    const zoneLow = price - clusterWidth * 0.5;
    const zoneHigh = price + clusterWidth * 0.5;
    const touches = countTouches(lookback, zoneLow, zoneHigh);
    // Keep a clear swing pivot even if the zone was only hit once
    const isSwing = c.sources.some((s) => s.startsWith("swing-"));
    const isShelf = c.sources.some((s) => s.endsWith("-shelf"));
    if (touches < 2 && c.prices.length < 2 && !isSwing && !isShelf) continue;

    const sources = [...new Set(c.sources)];
    let strength = Math.min(100, touches * 8 + c.prices.length * 10);
    if (isShelf) strength = Math.min(100, strength + 10);

    for (const m of mas) {
      if (Math.abs(m.v - price) <= clusterWidth) {
        strength = Math.min(100, strength + 12);
        sources.push(m.label);
      }
    }

    candidates.push({
      price: roundPrice(price, lastClose),
      type: price < lastClose ? "support" : "resistance",
      touches,
      strength,
      sources,
    });
  }

  // Only promote an MA if price has actually interacted with it
  for (const m of mas) {
    const near = candidates.some((l) => Math.abs(l.price - m.v) <= clusterWidth);
    if (near) continue;
    const touches = countTouches(
      lookback,
      m.v - clusterWidth * 0.5,
      m.v + clusterWidth * 0.5
    );
    if (touches < 3) continue;
    if (Math.abs(m.v - lastClose) < onPriceEps) continue;

    candidates.push({
      price: roundPrice(m.v, lastClose),
      type: m.v < lastClose ? "support" : "resistance",
      touches,
      strength: Math.min(70, 30 + touches * 5),
      sources: [m.label],
    });
  }

  const supports = candidates
    .filter((l) => l.type === "support" && l.price < lastClose)
    .sort((a, b) => {
      const distA = lastClose - a.price;
      const distB = lastClose - b.price;
      // Prefer nearby, then stronger
      if (Math.abs(distA - distB) / lastClose < 0.01) return b.strength - a.strength;
      return distA - distB;
    })
    .slice(0, 2);

  const resistances = candidates
    .filter((l) => l.type === "resistance" && l.price > lastClose)
    .sort((a, b) => {
      const distA = a.price - lastClose;
      const distB = b.price - lastClose;
      if (Math.abs(distA - distB) / lastClose < 0.01) return b.strength - a.strength;
      return distA - distB;
    })
    .slice(0, 2);

  return [...supports, ...resistances].sort((a, b) => a.price - b.price);
}

export function summarizePriceAction(candles: CandleInput[]) {
  if (candles.length === 0) return { lastClose: 0, change30d: 0, change90d: 0, trend: "flat" };
  const last = candles[candles.length - 1];
  const d30 = candles[Math.max(0, candles.length - 22)];
  const d90 = candles[Math.max(0, candles.length - 66)];
  const change30d = ((last.close - d30.close) / d30.close) * 100;
  const change90d = ((last.close - d90.close) / d90.close) * 100;
  const trend =
    change30d > 3 ? "uptrend" : change30d < -3 ? "downtrend" : "range-bound";
  return {
    lastClose: last.close,
    change30d: Math.round(change30d * 100) / 100,
    change90d: Math.round(change90d * 100) / 100,
    high52: Math.max(...candles.slice(-252).map((c) => c.high)),
    low52: Math.min(...candles.slice(-252).map((c) => c.low)),
    trend,
  };
}

/** Plain-language bullets for the nearest S/R zones */
export function buildZoneBullets(params: {
  ticker: string;
  levels: PivotLevel[];
  summary: {
    lastClose: number;
    change30d: number;
    trend: string;
  };
}): string[] {
  const { ticker, levels, summary } = params;
  const bullets: string[] = [];
  const price = summary.lastClose;

  bullets.push(
    `${ticker} last close ${fmt(price)} — ${summary.trend.replace("-", " ")} (${summary.change30d >= 0 ? "+" : ""}${summary.change30d}% over ~1 month).`
  );

  const supports = levels
    .filter((l) => l.type === "support")
    .sort((a, b) => b.price - a.price);
  const resistances = levels
    .filter((l) => l.type === "resistance")
    .sort((a, b) => a.price - b.price);

  for (const s of supports.slice(0, 2)) {
    const pct = (((price - s.price) / price) * 100).toFixed(1);
    bullets.push(
      `Support near ${fmt(s.price)} (~${pct}% below) — tested ${s.touches}×${sourceHint(s.sources)}.`
    );
  }
  for (const r of resistances.slice(0, 2)) {
    const pct = (((r.price - price) / price) * 100).toFixed(1);
    bullets.push(
      `Resistance near ${fmt(r.price)} (~${pct}% above) — tested ${r.touches}×${sourceHint(r.sources)}.`
    );
  }

  return bullets.slice(0, 4);
}

function fmt(n: number) {
  return n >= 100 ? n.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : String(n);
}

function sourceHint(sources: string[]) {
  const sma = sources.filter((s) => s.startsWith("SMA"));
  if (sma.length) return `; aligns with ${sma.join("/")}`;
  if (sources.includes("volume-node")) return "; high-volume area";
  if (sources.some((s) => s.endsWith("-shelf"))) return "; repeated wick tests";
  return "";
}
