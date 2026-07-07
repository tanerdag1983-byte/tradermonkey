"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPortfolio, syncAlpacaPortfolio } from "@/lib/supabase/api";
import { Wallet, TrendingUp, TrendingDown, RefreshCw, PieChart, Landmark } from "lucide-react";

interface PortfolioData {
  summary: {
    total_value: number;
    total_unrealized_pnl: number;
    position_count: number;
    open_order_count: number;
  };
  positions: Array<{
    symbol: string;
    quantity: number;
    avg_price: number | null;
    market_value: number | null;
    unrealized_pnl: number | null;
  }>;
}

export default function PortfolioSummaryCards() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    try {
      const result = await getPortfolio();
      if (result.success) {
        setData(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAlpacaPortfolio();
      await load();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();

    const supabase = createClient();
    const channel = supabase
      .channel("portfolio_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "positions" },
        () => {
          load();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Portfolio laden...</p>;
  }

  if (!data) {
    return null;
  }

  const { summary } = data;
  const pnlPositive = summary.total_unrealized_pnl >= 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Totale waarde" value={formatCurrency(summary.total_value)} icon={Wallet} />
        <SummaryCard
          label="Onrealiseerde P&L"
          value={formatCurrency(summary.total_unrealized_pnl)}
          icon={pnlPositive ? TrendingUp : TrendingDown}
          valueColor={pnlPositive ? "text-emerald-400" : "text-rose-400"}
        />
        <SummaryCard label="Posities" value={summary.position_count.toString()} icon={PieChart} />
        <SummaryCard label="Open orders" value={summary.open_order_count.toString()} icon={Landmark} />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/5 bg-[#151518] p-4 shadow-xl">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Landmark className="w-4 h-4 text-cyan-400" />
            Paper broker
          </h3>
          <p className="text-xs text-slate-400">Laatste Alpaca sync</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md"
        >
          {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {syncing ? "Synchroniseren..." : "Sync Alpaca"}
        </button>
      </div>

      {data.positions.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-[#151518] p-5 shadow-xl">
          <h3 className="mb-3 text-sm font-bold text-white uppercase tracking-wider">Posities</h3>
          <div className="space-y-2">
            {data.positions.map((pos, idx) => {
              const posPnl = pos.unrealized_pnl ?? 0;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-[#0A0A0B] border border-white/5 px-3 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-bold text-white font-mono">{pos.symbol}</p>
                    <p className="text-xs text-slate-500">{pos.quantity} stuks</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-white font-mono">{formatCurrency(pos.market_value)}</p>
                    <p className={`text-xs font-mono ${posPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {formatCurrency(pos.unrealized_pnl)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  valueColor = "text-white",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#151518] p-4 shadow-xl">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-cyan-400" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold font-mono ${valueColor}`}>{value}</p>
    </div>
  );
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}
