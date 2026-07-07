"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/app-header";
import { getPortfolio, syncPortfolio } from "@/lib/supabase/api";
import { Wallet, RefreshCw, AlertCircle } from "lucide-react";

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
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader />

      <main className="max-w-7xl w-full mx-auto p-4 lg:p-6 flex-1">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Portfolio</h2>
            <p className="text-sm text-slate-400 mt-1">Overzicht van je posities en lopende orders.</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
          >
            {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncing ? "Syncen..." : "Nu syncen"}
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-rose-950/40 border border-rose-800/80 rounded-lg p-4 text-rose-400 flex items-center gap-3 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {summary && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Totale waarde" value={formatCurrency(summary.total_value)} icon={Wallet} />
            <SummaryCard label="Onrealiseerde P&L" value={formatCurrency(summary.total_unrealized_pnl)} valueColor={summary.total_unrealized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"} />
            <SummaryCard label="Posities" value={summary.position_count.toString()} />
            <SummaryCard label="Open orders" value={summary.open_order_count.toString()} />
          </div>
        )}

        <div className="mb-4 text-xs text-slate-500 font-mono">
          {lastUpdated && <>Laatst bijgewerkt: {lastUpdated.toLocaleTimeString()}</>}
          {loading && !lastUpdated && "Laden..."}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-cyan-400" />
              Posities
            </h3>
            {positions.length === 0 ? (
              <p className="text-sm text-slate-400">Geen posities gevonden. Klik op &quot;Nu syncen&quot;.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-[#0A0A0B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/5">
                    <tr>
                      <th className="py-2 px-3 text-left">Symbool</th>
                      <th className="py-2 px-3 text-right">Aantal</th>
                      <th className="py-2 px-3 text-right">Gem. prijs</th>
                      <th className="py-2 px-3 text-right">Waarde</th>
                      <th className="py-2 px-3 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {positions.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-3 font-bold text-white">{p.symbol}</td>
                        <td className="py-3 px-3 text-right">{p.quantity}</td>
                        <td className="py-3 px-3 text-right">{formatCurrency(p.avg_price)}</td>
                        <td className="py-3 px-3 text-right">{formatCurrency(p.market_value)}</td>
                        <td className={`py-3 px-3 text-right font-medium ${(p.unrealized_pnl || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {formatCurrency(p.unrealized_pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              Lopende orders
            </h3>
            {orders.length === 0 ? (
              <p className="text-sm text-slate-400">Geen open orders gevonden.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-[#0A0A0B] text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/5">
                    <tr>
                      <th className="py-2 px-3 text-left">Symbool</th>
                      <th className="py-2 px-3 text-left">Richting</th>
                      <th className="py-2 px-3 text-left">Type</th>
                      <th className="py-2 px-3 text-right">Aantal</th>
                      <th className="py-2 px-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-3 font-bold text-white">{o.symbol}</td>
                        <td className="py-3 px-3">
                          <span className={`text-[10px] font-bold uppercase ${o.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {o.direction}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400">{o.order_type}</td>
                        <td className="py-3 px-3 text-right">{o.quantity}</td>
                        <td className="py-3 px-3">
                          <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-400 border border-white/5">
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

      <footer className="mt-auto bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS PRO. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
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
  icon?: React.ElementType;
  valueColor?: string;
}) {
  return (
    <div className="bg-[#151518] border border-white/5 rounded-xl p-4 shadow-xl">
      {Icon && (
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-cyan-400" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        </div>
      )}
      {!Icon && <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</p>}
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
