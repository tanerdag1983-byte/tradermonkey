"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPortfolio, syncPortfolio } from "@/lib/supabase/api";

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  avg_price: number;
  market_value: number | null;
  unrealized_pnl: number | null;
  last_synced_at: string | null;
}

interface Order {
  id: string;
  symbol: string;
  direction: string;
  order_type: string;
  quantity: number;
  status: string;
  filled_price: number | null;
  limit_price: number | null;
  stop_price: number | null;
}

interface PortfolioSummary {
  total_value: number;
  total_unrealized_pnl: number;
  position_count: number;
  open_order_count: number;
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPortfolio = async () => {
    try {
      const result = await getPortfolio();
      if (result.success) {
        setPositions(result.data.positions);
        setOrders(result.data.orders);
        setSummary(result.data.summary);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncPortfolio();
      if (result.success) {
        await loadPortfolio();
      } else {
        setError(result.error || "Sync failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadPortfolio();
    const interval = setInterval(loadPortfolio, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold">
                TM
              </div>
              <h1 className="text-xl font-bold text-zinc-900">TraderMonkeys</h1>
            </Link>
          </div>
          <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            Terug naar dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">Portfolio</h2>
            <p className="text-zinc-600">
              Overzicht van je posities en lopende orders.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {syncing ? "Syncen..." : "Nu syncen"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {summary && (
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Totale waarde"
              value={formatCurrency(summary.total_value)}
            />
            <SummaryCard
              label="Onrealiseerde P&L"
              value={formatCurrency(summary.total_unrealized_pnl)}
              valueColor={summary.total_unrealized_pnl >= 0 ? "text-green-600" : "text-red-600"}
            />
            <SummaryCard label="Posities" value={summary.position_count.toString()} />
            <SummaryCard label="Open orders" value={summary.open_order_count.toString()} />
          </div>
        )}

        <div className="mb-2 text-xs text-zinc-500">
          {lastUpdated && <>Laatst bijgewerkt: {lastUpdated.toLocaleTimeString()}</>}
          {loading && !lastUpdated && "Laden..."}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900">Posities</h3>
            {positions.length === 0 ? (
              <p className="text-sm text-zinc-500">Geen posities gevonden. Klik op &quot;Nu syncen&quot;.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-200 text-left text-zinc-500">
                    <tr>
                      <th className="pb-2 font-medium">Symbool</th>
                      <th className="pb-2 font-medium">Aantal</th>
                      <th className="pb-2 font-medium">Gem. prijs</th>
                      <th className="pb-2 font-medium">Waarde</th>
                      <th className="pb-2 font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {positions.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 font-medium text-zinc-900">{p.symbol}</td>
                        <td className="py-3 text-zinc-600">{p.quantity}</td>
                        <td className="py-3 text-zinc-600">{formatCurrency(p.avg_price)}</td>
                        <td className="py-3 text-zinc-600">{formatCurrency(p.market_value)}</td>
                        <td className={`py-3 font-medium ${(p.unrealized_pnl || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(p.unrealized_pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900">Lopende orders</h3>
            {orders.length === 0 ? (
              <p className="text-sm text-zinc-500">Geen open orders gevonden.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-200 text-left text-zinc-500">
                    <tr>
                      <th className="pb-2 font-medium">Symbool</th>
                      <th className="pb-2 font-medium">Richting</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Aantal</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-3 font-medium text-zinc-900">{o.symbol}</td>
                        <td className="py-3 text-zinc-600">{o.direction}</td>
                        <td className="py-3 text-zinc-600">{o.order_type}</td>
                        <td className="py-3 text-zinc-600">{o.quantity}</td>
                        <td className="py-3">
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
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
