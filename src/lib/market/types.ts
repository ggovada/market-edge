/**
 * Market data provider interface — swap Yahoo for Finnhub/Twelve Data/NSE later.
 */

export type Quote = {
  ticker: string;
  price: number;
  dayChange: number;
  dayChangePct: number;
  currency: string;
  fetchedAt: Date;
};

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CandleInterval = "1d" | "1wk";

export interface MarketDataProvider {
  getQuotes(tickers: string[]): Promise<Quote[]>;
  getHistory(
    ticker: string,
    interval: CandleInterval,
    period: string
  ): Promise<Candle[]>;
}
