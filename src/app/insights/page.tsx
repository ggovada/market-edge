"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { RefreshCw } from "lucide-react";

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

function InsightsInner() {
  const search = useSearchParams();
  const [ticker, setTicker] = useState(search.get("ticker") ?? "RELIANCE.NS");
  const [timeframe, setTimeframe] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [candles, setCandles] = useState<
    { time: number; open: number; high: number; low: number; close: number }[]
  >([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(force = false) {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const interval = timeframe === "WEEKLY" ? "1wk" : "1d";
      const period = timeframe === "WEEKLY" ? "3y" : "1y";
      const [histRes, insightRes] = await Promise.all([
        fetch(`/api/history?ticker=${encodeURIComponent(ticker)}&interval=${interval}&period=${period}`),
        fetch(
          `/api/insights?ticker=${encodeURIComponent(ticker)}&timeframe=${timeframe}${force ? "&force=1" : ""}`
        ),
      ]);
      if (!histRes.ok) throw new Error("Failed to load chart history");
      const hist = await histRes.json();
      setCandles(hist.candles ?? []);

      if (insightRes.ok) {
        const insight = await insightRes.json();
        setLevels(insight.levels ?? []);
        setNarrative(insight.aiNarrative ?? "");
      } else {
        setLevels([]);
        setNarrative("Could not generate insights for this ticker.");
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
          Look at a stock’s price history and suggested support / resistance levels.
          This is for information only — not investment advice.
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
          <label className="label">Stock symbol</label>
          <input
            className="input"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Example: RELIANCE.NS"
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
              AI rationale
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {narrative || (loading ? "Computing…" : "Run analysis to see narrative.")}
            </p>
            <p className="mt-4 text-xs text-muted">
              Not financial advice. Levels may be stale if Yahoo Finance is
              unavailable — cached insights are shown when possible.
            </p>
          </div>
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Price</th>
                  <th>Type</th>
                  <th>Strength</th>
                  <th>Touches</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((l) => (
                  <tr key={`${l.type}-${l.price}`}>
                    <td className="font-medium">{l.price}</td>
                    <td className="capitalize">{l.type}</td>
                    <td>{l.strength}</td>
                    <td>{l.touches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
