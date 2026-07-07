"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { apiFetch } from "@/lib/supabase/api";

interface MarketBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export default function MarketChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    const load = async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/market/bars/${symbol}?timeframe=1d&limit=90`);
        if (!res.success || !Array.isArray(res.data)) {
          setError("Geen grafiekdata beschikbaar.");
          return;
        }

        const bars: MarketBar[] = res.data;
        if (bars.length === 0) {
          setError("Geen grafiekdata beschikbaar.");
          return;
        }

        const lightweightCharts = await import("lightweight-charts");
        if (isCancelled || !containerRef.current) return;

        const chart = lightweightCharts.createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 300,
          layout: {
            background: { color: "#ffffff" },
            textColor: "#333",
          },
          grid: {
            vertLines: { color: "#f0f0f0" },
            horzLines: { color: "#f0f0f0" },
          },
          rightPriceScale: {
            borderColor: "#e0e0e0",
          },
          timeScale: {
            borderColor: "#e0e0e0",
            timeVisible: true,
          },
        });

        const candlestickSeries = chart.addSeries(lightweightCharts.CandlestickSeries, {
          upColor: "#16a34a",
          downColor: "#dc2626",
          borderUpColor: "#16a34a",
          borderDownColor: "#dc2626",
          wickUpColor: "#16a34a",
          wickDownColor: "#dc2626",
        });

        const data = bars.map((b) => ({
          time: new Date(b.timestamp).toISOString().split("T")[0],
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        }));

        candlestickSeries.setData(data);
        chart.timeScale().fitContent();

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;

        window.addEventListener("resize", handleResize);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fout bij laden grafiek");
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      isCancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      window.removeEventListener("resize", handleResize);
    };
  }, [symbol]);

  if (loading) {
    return <div className="text-sm text-zinc-500">Grafiek laden...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  return <div ref={containerRef} className="w-full" />;
}
