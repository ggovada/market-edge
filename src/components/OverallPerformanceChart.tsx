"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatINR } from "@/lib/utils";
import { Money } from "@/components/StatCard";

export type PerformanceRange = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y";

const RANGES: { id: PerformanceRange; label: string }[] = [
  { id: "1D", label: "1 day" },
  { id: "1W", label: "1 week" },
  { id: "1M", label: "1 month" },
  { id: "3M", label: "3 months" },
  { id: "YTD", label: "This year" },
  { id: "1Y", label: "1 year" },
  { id: "5Y", label: "5 years" },
];

type Series = {
  range: PerformanceRange;
  points: { date: string; totalValue: number; totalCostBasis: number }[];
  startValue: number;
  endValue: number;
  change: number;
  changePct: number;
};

function formatTick(date: string, range: PerformanceRange) {
  const d = new Date(date.length === 10 ? `${date}T12:00:00` : date);
  if (range === "1D") {
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1W" || range === "1M") {
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export function OverallPerformanceChart({
  memberId,
}: {
  memberId?: string | null;
}) {
  const [range, setRange] = useState<PerformanceRange>("1Y");
  const [series, setSeries] = useState<Series | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ range });
        if (memberId) qs.set("memberId", memberId);
        const res = await fetch(`/api/performance?${qs}`);
        const text = await res.text();
        if (!res.ok || !text) {
          throw new Error(
            text ? JSON.parse(text).error || "Failed to load" : "Empty response"
          );
        }
        const data = JSON.parse(text) as Series;
        if (!cancelled) setSeries(data);
      } catch (e) {
        if (!cancelled) {
          setSeries(null);
          setError((e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range, memberId]);

  const chartData =
    series?.points.map((p) => ({
      ...p,
      label: formatTick(p.date, range),
    })) ?? [];

  const positive = (series?.changePct ?? 0) >= 0;

  return (
    <div className="card p-5 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            Performance over time
          </h2>
          <p className="mt-1 text-base text-muted">
            {memberId
              ? "Value of this person’s portfolios"
              : "Combined value of everyone you manage"}
          </p>
        </div>
        {series && series.points.length > 0 ? (
          <div className="text-left md:text-right">
            <div
              className={cn(
                "font-[family-name:var(--font-display)] text-3xl font-semibold",
                positive ? "gain" : "loss"
              )}
            >
              {positive ? "Up" : "Down"} {Math.abs(series.changePct).toFixed(1)}%
            </div>
            <div className="mt-1 text-base text-muted">
              <Money value={series.change} signed /> · now{" "}
              {formatINR(series.endValue, true)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={cn(
              "min-h-11 rounded-full px-4 py-2 text-base font-semibold transition-colors",
              range === r.id
                ? "bg-accent text-white"
                : "border-2 border-line bg-white text-ink hover:bg-accent-soft"
            )}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {!mounted || loading ? (
          <div className="flex h-64 items-center justify-center rounded-xl bg-accent-soft/30 text-sm text-muted md:h-80">
            Loading {range} performance…
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-line text-sm text-loss md:h-80">
            {error}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted md:h-80">
            Not enough trade and price history for this range yet.
          </div>
        ) : (
          <div className="h-64 w-full md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={positive ? "#0f7a5a" : "#c0392b"}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor={positive ? "#0f7a5a" : "#c0392b"}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="#d5dee5"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#5a6b78" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#5a6b78" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatINR(v, true)}
                  width={72}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatINR(Number(value ?? 0)),
                    name === "totalValue" ? "Value" : "Cost basis",
                  ]}
                  labelFormatter={(_, payload) => {
                    const raw = payload?.[0]?.payload?.date as string | undefined;
                    if (!raw) return "";
                    const d = new Date(
                      raw.length === 10 ? `${raw}T12:00:00` : raw
                    );
                    return d.toLocaleString("en-IN");
                  }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #d5dee5",
                    boxShadow: "0 8px 24px rgba(20,33,43,0.08)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalValue"
                  name="totalValue"
                  stroke={positive ? "#0f7a5a" : "#c0392b"}
                  fill="url(#perfFill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="totalCostBasis"
                  name="totalCostBasis"
                  stroke="#5a6b78"
                  fill="transparent"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
