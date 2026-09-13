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
import { formatINR } from "@/lib/utils";

type Snapshot = {
  date: string;
  totalValue: number;
  totalCostBasis: number;
};

export function PortfolioValueChart({ snapshots }: { snapshots: Snapshot[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const data = snapshots.map((s) => ({
    date: new Date(s.date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    }),
    value: s.totalValue,
    cost: s.totalCostBasis,
    pl: s.totalValue - s.totalCostBasis,
  }));

  if (!mounted) {
    return <div className="h-64 animate-pulse rounded-xl bg-accent-soft/40" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
        No daily snapshots yet. Open the dashboard with live prices, then hit
        “Snapshot now” in Settings — or wait for the nightly cron.
      </div>
    );
  }

  return (
    <div className="h-64 w-full md:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0b6e6e" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#0b6e6e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#d5dee5" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#5a6b78" }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#5a6b78" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatINR(v, true)}
            width={72}
          />
          <Tooltip
            formatter={(value) => formatINR(Number(value ?? 0))}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #d5dee5",
              boxShadow: "0 8px 24px rgba(20,33,43,0.08)",
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            name="Portfolio value"
            stroke="#0b6e6e"
            fill="url(#valueFill)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="cost"
            name="Cost basis"
            stroke="#5a6b78"
            fill="transparent"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
