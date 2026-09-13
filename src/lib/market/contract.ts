/** Multiplier for notional / P/L: equity = 1, futures = lot size. */
export function contractMultiplier(
  instrumentType: string | null | undefined,
  lotSize?: number | null
): number {
  if ((instrumentType ?? "").toUpperCase() === "FUTURES") {
    return Math.max(1, Number(lotSize) || 1);
  }
  return 1;
}

export function isFuturesInstrument(
  instrumentType: string | null | undefined
): boolean {
  return (instrumentType ?? "").toUpperCase() === "FUTURES";
}

/** lots (or shares) × multiplier × price — contract notional (not AUM for futures). */
export function notionalValue(
  quantity: number,
  price: number,
  instrumentType?: string | null,
  lotSize?: number | null
): number {
  return quantity * contractMultiplier(instrumentType, lotSize) * price;
}

/** Unrealized / realized style P/L for futures (and equity with lotSize=1). */
export function priceDiffPl(
  quantity: number,
  entryPrice: number,
  markPrice: number,
  instrumentType?: string | null,
  lotSize?: number | null
): number {
  return (
    quantity *
    contractMultiplier(instrumentType, lotSize) *
    (markPrice - entryPrice)
  );
}

/**
 * What this position contributes to portfolio holdings value.
 * Equity: market value (qty × price).
 * Futures: unrealized P/L only (lots × lotSize × (mark − entry)).
 */
export function holdingBookValue(opts: {
  quantity: number;
  markPrice: number;
  costBasis: number;
  avgCost: number;
  instrumentType?: string | null;
  lotSize?: number | null;
}): number {
  if (isFuturesInstrument(opts.instrumentType)) {
    return priceDiffPl(
      opts.quantity,
      opts.avgCost,
      opts.markPrice,
      opts.instrumentType,
      opts.lotSize
    );
  }
  return opts.quantity * opts.markPrice;
}
