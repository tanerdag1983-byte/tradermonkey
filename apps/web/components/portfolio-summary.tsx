"use client";

import { useEffect, useState } from "react";
import { getPortfolio } from "@/lib/supabase/api";

interface PortfolioSummary {
  total_value: number;
  total_unrealized_pnl: number;
  position_count: number;
  open_order_count: number;
}

export default function PortfolioSummaryCards() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await getPortfolio();
        if (result.success) {
          setSummary(result.data.summary);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-sm text-zinc-500">Portfolio laden...</div>;
  }

  if (!summary) {
    return null;
  }

  return (
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
    currency: "EUR",
  }).format(value);
}
