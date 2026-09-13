"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Level = {
  price: number;
  type: "support" | "resistance";
  strength: number;
};

export function CandlestickChart({
  candles,
  levels = [],
}: {
  candles: Candle[];
  levels?: Level[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#5a6b78",
      },
      grid: {
        vertLines: { color: "#eef2f4" },
        horzLines: { color: "#eef2f4" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      height: 360,
      autoSize: true,
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#0f7a5a",
      downColor: "#c0392b",
      borderVisible: false,
      wickUpColor: "#0f7a5a",
      wickDownColor: "#c0392b",
    });

    series.setData(
      candles.map((c) => ({
        time: c.time as import("lightweight-charts").UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const priceLines = levels.slice(0, 8).map((l) =>
      series.createPriceLine({
        price: l.price,
        color: l.type === "support" ? "#0b6e6e" : "#b45309",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: l.type === "support" ? "S" : "R",
      })
    );

    // markers unused but keep API import happy for future
    void createSeriesMarkers;
    void priceLines as unknown as ISeriesApi<"Candlestick">;

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, levels]);

  if (!candles.length) {
    return (
      <div className="flex h-[360px] items-center justify-center text-sm text-muted">
        No candle data
      </div>
    );
  }

  return <div ref={containerRef} className="w-full overflow-hidden rounded-xl" />;
}
