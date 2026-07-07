"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { apiFetch } from "@/lib/supabase/api";
import { Loader2 } from "lucide-react";

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
            background: { color: "#0A0A0B" },
            textColor: "#94a3b8",
          },
          grid: {
            vertLines: { color: "#1e293b" },
            horzLines: { color: "#1e293b" },
          },
          rightPriceScale: {
            borderColor: "#334155",
          },
          timeScale: {
            borderColor: "#334155",
            timeVisible: true,
          },
        });

        const candlestickSeries = chart.addSeries(lightweightCharts.CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#f43f5e",
          borderUpColor: "#10b981",
          borderDownColor: "#f43f5e",
          wickUpColor: "#10b981",
          wickDownColor: "#f43f5e",
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
    return (
      <div className="h-72 flex items-center justify-center text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Grafiek laden...
      </div>
    );
  }

  if (error) {
    return <div className="h-72 flex items-center justify-center text-sm text-rose-400">{error}</div>;
  }

  return <div ref={containerRef} className="w-full" />;
}
