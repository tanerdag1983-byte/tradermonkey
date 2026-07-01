"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getPortfolio, syncAlpacaPortfolio } from "@/lib/supabase/api";

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
        {
          event: "*",
          schema: "public",
          table: "positions",
        },
        () => {
          load();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
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
    return <div className="text-sm text-zinc-500">Portfolio laden...</div>;
  }

  if (!data) {
    return null;
  }

  const { summary } = data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Totale waarde" value={formatCurrency(summary.total_value)} />
        <SummaryCard
          label="Onrealiseerde P&L"
          value={formatCurrency(summary.total_unrealized_pnl)}
          valueColor={summary.total_unrealized_pnl >= 0 ? "text-green-600" : "text-red-600"}
        />
        <SummaryCard label="Posities" value={summary.position_count.toString()} />
        <SummaryCard label="Open orders" value={summary.open_order_count.toString()} />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="font-semibold text-zinc-900">Paper broker</h3>
          <p className="text-sm text-zinc-600">Laatste Alpaca sync.</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {syncing ? "Synchroniseren..." : "Sync Alpaca"}
        </button>
      </div>

      {data.positions.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-zinc-900">Posities</h3>
          <div className="divide-y divide-zinc-100">
            {data.positions.map((pos, idx) => (
              <div key={idx} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">{pos.symbol}</p>
                  <p className="text-zinc-500">{pos.quantity} stuks</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-zinc-900">{formatCurrency(pos.market_value)}</p>
                  <p className={pos.unrealized_pnl && pos.unrealized_pnl >= 0 ? "text-green-600" : "text-red-600"}>
                    {formatCurrency(pos.unrealized_pnl)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueColor = "text-zinc-900",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
