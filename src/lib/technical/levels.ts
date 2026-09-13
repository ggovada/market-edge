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
export function findSwingPivots(candles: CandleInput[], window = 5) {
  const highs: { price: number; index: number }[] = [];
  const lows: { price: number; index: number }[] = [];

  for (let i = window; i < candles.length - window; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= window; j++) {
      if (candles[i].high < candles[i - j].high || candles[i].high < candles[i + j].high) {
        isHigh = false;
      }
      if (candles[i].low > candles[i - j].low || candles[i].low > candles[i + j].low) {
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

/** Cluster nearby pivot prices into support/resistance zones */
export function computeSupportResistance(
  candles: CandleInput[],
  opts?: { window?: number; clusterPct?: number }
): PivotLevel[] {
  if (candles.length < 20) return [];

  const window = opts?.window ?? 5;
  const clusterPct = opts?.clusterPct ?? 0.015;
  const { highs, lows } = findSwingPivots(candles, window);
  const lastClose = candles[candles.length - 1].close;

  type Raw = { price: number; type: "support" | "resistance"; source: string };
  const raw: Raw[] = [
    ...highs.map((h) => ({
      price: h.price,
      type: "resistance" as const,
      source: "swing-high",
    })),
    ...lows.map((l) => ({
      price: l.price,
      type: "support" as const,
      source: "swing-low",
    })),
  ];

  // High-volume closes as additional levels
  const volSorted = [...candles].sort((a, b) => b.volume - a.volume);
  const topVol = volSorted.slice(0, Math.min(10, Math.floor(candles.length * 0.05)));
  for (const c of topVol) {
    raw.push({
      price: c.close,
      type: c.close <= lastClose ? "support" : "resistance",
      source: "high-volume-close",
    });
  }

  // Cluster
  raw.sort((a, b) => a.price - b.price);
  const clusters: {
    prices: number[];
    sources: string[];
    supportVotes: number;
    resistanceVotes: number;
  }[] = [];

  for (const r of raw) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(r.price - avg(last.prices)) / lastClose < clusterPct) {
      last.prices.push(r.price);
      last.sources.push(r.source);
      if (r.type === "support") last.supportVotes++;
      else last.resistanceVotes++;
    } else {
      clusters.push({
        prices: [r.price],
        sources: [r.source],
        supportVotes: r.type === "support" ? 1 : 0,
        resistanceVotes: r.type === "resistance" ? 1 : 0,
      });
    }
  }

  const ma50 = sma(candles, 50);
  const ma100 = sma(candles, 100);
  const ma200 = sma(candles, 200);
  const mas = [
    { v: ma50, label: "SMA50" },
    { v: ma100, label: "SMA100" },
    { v: ma200, label: "SMA200" },
  ].filter((m) => m.v != null) as { v: number; label: string }[];

  const levels: PivotLevel[] = clusters.map((c) => {
    const price = avg(c.prices);
    const type: "support" | "resistance" =
      c.supportVotes >= c.resistanceVotes ? "support" : "resistance";
    // Reclassify relative to last close if ambiguous
    const finalType =
      Math.abs(c.supportVotes - c.resistanceVotes) <= 1
        ? price <= lastClose
          ? "support"
          : "resistance"
        : type;

    let strength = Math.min(100, c.prices.length * 18);
    const sources = [...new Set(c.sources)];

    for (const m of mas) {
      if (Math.abs(m.v - price) / lastClose < clusterPct) {
        strength = Math.min(100, strength + 15);
        sources.push(m.label);
      }
    }

    return {
      price: Math.round(price * 100) / 100,
      type: finalType,
      touches: c.prices.length,
      strength,
      sources,
    };
  });

  // Add MA levels as soft S/R if not already clustered
  for (const m of mas) {
    const near = levels.some((l) => Math.abs(l.price - m.v) / lastClose < clusterPct);
    if (!near) {
      levels.push({
        price: Math.round(m.v * 100) / 100,
        type: m.v <= lastClose ? "support" : "resistance",
        touches: 1,
        strength: 40,
        sources: [m.label],
      });
    }
  }

  return levels
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 12)
    .sort((a, b) => a.price - b.price);
}

function avg(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
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
