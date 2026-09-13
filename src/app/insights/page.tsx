"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ExternalLink, RefreshCw } from "lucide-react";
import { TickerSearchInput } from "@/components/TickerSearchInput";

const CandlestickChart = dynamic(
  () => import("@/components/CandlestickChart").then((m) => m.CandlestickChart),
  { ssr: false }
);

type Level = {
  price: number;
  type: "support" | "resistance";
  touches: number;
  strength: number;
  sources: string[];
};

type NewsItem = {
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
};

type OutletSignal = {
  outlet: string;
  signal: string;
  detail: string;
  asOf?: string;
};

function signalClass(signal: string) {
  const s = signal.toLowerCase();
  if (s.includes("buy") || s.includes("bull")) return "text-gain";
  if (s.includes("sell") || s.includes("bear")) return "text-loss";
  return "text-muted";
}

function InsightsInner() {
  const search = useSearchParams();
  const [ticker, setTicker] = useState(search.get("ticker") ?? "RELIANCE.NS");
  const [timeframe, setTimeframe] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [candles, setCandles] = useState<
    { time: number; open: number; high: number; low: number; close: number }[]
  >([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [bullets, setBullets] = useState<string[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [signals, setSignals] = useState<OutletSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false, symbol = ticker) {
    if (!symbol.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const interval = timeframe === "WEEKLY" ? "1wk" : "1d";
      const period = timeframe === "WEEKLY" ? "3y" : "1y";
      const [histRes, insightRes] = await Promise.all([
        fetch(
          `/api/history?ticker=${encodeURIComponent(symbol)}&interval=${interval}&period=${period}`
        ),
        fetch(
          `/api/insights?ticker=${encodeURIComponent(symbol)}&timeframe=${timeframe}${force ? "&force=1" : ""}`
        ),
      ]);
      if (!histRes.ok) throw new Error("Failed to load chart history");
      const hist = await histRes.json();
      setCandles(hist.candles ?? []);

      if (insightRes.ok) {
        const insight = await insightRes.json();
        setLevels(insight.levels ?? []);
        setBullets(insight.bullets ?? []);
        setNews(insight.news ?? []);
        setSignals(insight.signals ?? []);
      } else {
        setLevels([]);
        setBullets([]);
        setNews([]);
        setSignals([]);
        setError("Could not generate insights for this ticker.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold md:text-4xl">
          Charts AI
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Nearest support / resistance zones, recent headlines, and analyst signals.
          Informational only — not investment advice.
        </p>
      </div>

      <form
        className="card flex flex-col gap-4 p-5 md:flex-row md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          load(true);
        }}
      >
        <div className="flex-1">
          <TickerSearchInput
            id="insights-ticker"
            label="Stock symbol"
            placeholder="Try: Divis, Reliance, Infosys"
            value={ticker}
            instrumentType="EQUITY"
            onChange={(symbol) => setTicker(symbol)}
          />
        </div>
        <div>
          <label className="label">View</label>
          <select
            className="select"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as "DAILY" | "WEEKLY")}
          >
            <option value="DAILY">Daily candles</option>
            <option value="WEEKLY">Weekly candles</option>
          </select>
        </div>
        <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Show chart
        </button>
      </form>

      {error ? <p className="text-sm text-loss">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-3 md:p-4">
          <CandlestickChart candles={candles} levels={levels} />
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Support & resistance
            </h2>
            {loading && !bullets.length ? (
              <p className="mt-3 text-sm text-muted">Computing…</p>
            ) : bullets.length ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink">
                {bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">Run analysis to see zones.</p>
            )}
          </div>

          <div className="card p-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Latest news
            </h2>
            {news.length ? (
              <ul className="mt-3 space-y-3">
                {news.map((n) => (
                  <li key={n.url}>
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-2 text-sm font-medium text-accent hover:underline"
                    >
                      <span className="flex-1">{n.title}</span>
                      <ExternalLink
                        size={14}
                        className="mt-0.5 shrink-0 opacity-60 group-hover:opacity-100"
                      />
                    </a>
                    <p className="mt-0.5 text-xs text-muted">{n.publisher}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {loading ? "Loading headlines…" : "No recent headlines found."}
              </p>
            )}
          </div>

          <div className="card p-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Buy / sell signals
            </h2>
            {signals.length ? (
              <ul className="mt-3 space-y-3">
                {signals.map((s) => (
                  <li key={s.outlet} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-ink">{s.outlet}</span>
                      <span className={`shrink-0 font-semibold ${signalClass(s.signal)}`}>
                        {s.signal}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{s.detail}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {loading
                  ? "Loading signals…"
                  : "No analyst signals available for this ticker."}
              </p>
            )}
            <p className="mt-4 text-xs text-muted">
              Not financial advice. Levels are algorithmic; ratings come from Yahoo-sourced
              outlets and may lag.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="text-muted">Loading insights…</div>}>
      <InsightsInner />
    </Suspense>
  );
}
