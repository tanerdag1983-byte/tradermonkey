"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/app-header";
import {
  getPortfolio,
  syncPortfolio,
  createManualPosition,
  createManualOrder,
  deleteManualPosition,
  deleteManualOrder,
  runPositionAdvice,
  getPositionAdvice,
} from "@/lib/supabase/api";
import { Wallet, RefreshCw, AlertCircle, Plus, Trash2, Sparkles, X } from "lucide-react";

interface Position {
  id: string;
  broker_id: string;
  symbol: string;
  quantity: number;
  avg_price: number;
  market_value: number | null;
  unrealized_pnl: number | null;
  last_synced_at: string | null;
}

interface Order {
  id: string;
  broker_id: string | null;
  symbol: string;
  direction: string;
  order_type: string;
  quantity: number;
  status: string;
  filled_price: number | null;
  limit_price: number | null;
  stop_price: number | null;
}

interface AdviceItem {
  id: string;
  symbol: string;
  recommendation: string;
  confidence: number | null;
  reasoning: string | null;
  latest_price: number | null;
  generated_at: string | null;
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
  const [advice, setAdvice] = useState<AdviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [advising, setAdvising] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showPositionForm, setShowPositionForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);

  const [positionForm, setPositionForm] = useState({ symbol: "", quantity: "", avg_price: "", currency: "USD" });
  const [orderForm, setOrderForm] = useState({
    symbol: "",
    direction: "BUY",
    order_type: "market",
    quantity: "",
    filled_price: "",
    limit_price: "",
    stop_price: "",
  });

  const loadPortfolio = async () => {
    try {
      const result = await getPortfolio();
      if (result.success) {
        setPositions(result.data.positions);
        setOrders(result.data.orders);
        setSummary(result.data.summary);
        setLastUpdated(new Date());
        setError(null);
      } else {
        setError(result.error || "Failed to load portfolio");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  };

  const loadAdvice = async () => {
    try {
      const result = await getPositionAdvice(undefined, 10);
      if (result.success) {
        setAdvice(result.data);
      }
    } catch {
      // non-fatal
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

  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await createManualPosition({
        symbol: positionForm.symbol,
        quantity: Number(positionForm.quantity),
        avg_price: Number(positionForm.avg_price),
        currency: positionForm.currency,
      });
      if (result.success) {
        setPositionForm({ symbol: "", quantity: "", avg_price: "", currency: "USD" });
        setShowPositionForm(false);
        await loadPortfolio();
      } else {
        setError(result.error || "Kon positie niet aanmaken");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon positie niet aanmaken");
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const result = await createManualOrder({
        symbol: orderForm.symbol,
        direction: orderForm.direction as "BUY" | "SELL",
        order_type: orderForm.order_type as "market" | "limit" | "stop" | "stop_limit",
        quantity: Number(orderForm.quantity),
        filled_price: orderForm.filled_price ? Number(orderForm.filled_price) : undefined,
        limit_price: orderForm.limit_price ? Number(orderForm.limit_price) : undefined,
        stop_price: orderForm.stop_price ? Number(orderForm.stop_price) : undefined,
      });
      if (result.success) {
        setOrderForm({ symbol: "", direction: "BUY", order_type: "market", quantity: "", filled_price: "", limit_price: "", stop_price: "" });
        setShowOrderForm(false);
        await loadPortfolio();
      } else {
        setError(result.error || "Kon order niet aanmaken");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon order niet aanmaken");
    }
  };

  const handleDeletePosition = async (id: string) => {
    if (!confirm("Positie verwijderen?")) return;
    try {
      await deleteManualPosition(id);
      await loadPortfolio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!confirm("Order verwijderen?")) return;
    try {
      await deleteManualOrder(id);
      await loadPortfolio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  };

  const handleRunAdvice = async () => {
    setAdvising(true);
    setError(null);
    try {
      const result = await runPositionAdvice();
      if (result.success) {
        await loadAdvice();
        await loadPortfolio();
      } else {
        setError(result.error || "Advies genereren mislukt");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Advies genereren mislukt");
    } finally {
      setAdvising(false);
    }
  };

  useEffect(() => {
    loadPortfolio();
    loadAdvice();
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
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowPositionForm((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#151518] border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.03] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Positie
            </button>
            <button
              onClick={() => setShowOrderForm((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#151518] border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.03] transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Order
            </button>
            <button
              onClick={handleRunAdvice}
              disabled={advising}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#151518] border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.03] transition-all disabled:opacity-50"
            >
              {advising ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
              {advising ? "Advies..." : "AI watch"}
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
            >
              {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? "Syncen..." : "Nu syncen"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-rose-950/40 border border-rose-800/80 rounded-lg p-4 text-rose-400 flex items-center gap-3 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {(showPositionForm || showOrderForm) && (
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            {showPositionForm && (
              <form onSubmit={handleCreatePosition} className="bg-[#151518] border border-white/5 rounded-xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white">Handmatige positie toevoegen</h4>
                  <button type="button" onClick={() => setShowPositionForm(false)} className="text-slate-500 hover:text-slate-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input required placeholder="Symbool" value={positionForm.symbol} onChange={(e) => setPositionForm({ ...positionForm, symbol: e.target.value.toUpperCase() })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                  <input required placeholder="Aantal" type="number" step="any" value={positionForm.quantity} onChange={(e) => setPositionForm({ ...positionForm, quantity: e.target.value })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                  <input required placeholder="Gem. prijs" type="number" step="any" value={positionForm.avg_price} onChange={(e) => setPositionForm({ ...positionForm, avg_price: e.target.value })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                  <input placeholder="Valuta" value={positionForm.currency} onChange={(e) => setPositionForm({ ...positionForm, currency: e.target.value.toUpperCase() })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                </div>
                <button type="submit" className="mt-3 w-full rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 py-2 text-xs font-bold text-slate-950 hover:opacity-90 transition-all">Opslaan</button>
              </form>
            )}
            {showOrderForm && (
              <form onSubmit={handleCreateOrder} className="bg-[#151518] border border-white/5 rounded-xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white">Handmatige order toevoegen</h4>
                  <button type="button" onClick={() => setShowOrderForm(false)} className="text-slate-500 hover:text-slate-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input required placeholder="Symbool" value={orderForm.symbol} onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value.toUpperCase() })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                  <input required placeholder="Aantal" type="number" step="any" value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                  <select value={orderForm.direction} onChange={(e) => setOrderForm({ ...orderForm, direction: e.target.value })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                  <select value={orderForm.order_type} onChange={(e) => setOrderForm({ ...orderForm, order_type: e.target.value })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="market">market</option>
                    <option value="limit">limit</option>
                    <option value="stop">stop</option>
                    <option value="stop_limit">stop_limit</option>
                  </select>
                  <input placeholder="Gevulde prijs" type="number" step="any" value={orderForm.filled_price} onChange={(e) => setOrderForm({ ...orderForm, filled_price: e.target.value })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                  <input placeholder="Limit prijs" type="number" step="any" value={orderForm.limit_price} onChange={(e) => setOrderForm({ ...orderForm, limit_price: e.target.value })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                  <input placeholder="Stop prijs" type="number" step="any" value={orderForm.stop_price} onChange={(e) => setOrderForm({ ...orderForm, stop_price: e.target.value })} className="bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white" />
                </div>
                <button type="submit" className="mt-3 w-full rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 py-2 text-xs font-bold text-slate-950 hover:opacity-90 transition-all">Opslaan</button>
              </form>
            )}
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
              <p className="text-sm text-slate-400">Geen posities gevonden. Klik op &quot;Nu syncen&quot; of voeg handmatig een positie toe.</p>
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
                      <th className="py-2 px-3 text-center"></th>
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
                        <td className="py-3 px-3 text-center">
                          <button onClick={() => handleDeletePosition(p.id)} className="text-slate-500 hover:text-rose-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                      <th className="py-2 px-3 text-center"></th>
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
                          <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-400 border border-white/5 capitalize">
                            {o.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button onClick={() => handleDeleteOrder(o.id)} className="text-slate-500 hover:text-rose-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {advice.length > 0 && (
          <section className="mt-6 bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Laatste AI positiesadvies
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {advice.map((a) => (
                <div key={a.id} className="bg-[#0A0A0B] border border-white/5 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white font-mono">{a.symbol}</span>
                    <span className={`text-[10px] font-bold uppercase ${a.recommendation === 'HOLD' || a.recommendation === 'ADD' ? 'text-emerald-400' : a.recommendation === 'EXIT' || a.recommendation === 'REDUCE' ? 'text-rose-400' : 'text-slate-400'}`}>
                      {a.recommendation}
                    </span>
                  </div>
                  {a.confidence !== null && (
                    <p className="text-[10px] text-slate-500 font-mono mb-1">Confidence: {(a.confidence * 100).toFixed(0)}%</p>
                  )}
                  <p className="text-xs text-slate-300 leading-relaxed">{a.reasoning || "Geen redenering beschikbaar."}</p>
                </div>
              ))}
            </div>
          </section>
        )}
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
