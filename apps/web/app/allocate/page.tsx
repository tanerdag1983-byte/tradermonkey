"use client";

import { useState } from "react";
import AppHeader from "@/components/app-header";
import { apiFetch } from "@/lib/supabase/api";
import { PieChart, Loader2, AlertCircle, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Allocation {
  symbol: string;
  direction: string;
  allocated_budget: number;
  quantity: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number[];
  confidence: number;
  thesis: string;
}

export default function AllocatePage() {
  const [budget, setBudget] = useState<number>(1000);
  const [currency, setCurrency] = useState("EUR");
  const [riskProfile, setRiskProfile] = useState("moderate");
  const [watchlistInput, setWatchlistInput] = useState("AAPL, MSFT, TSLA, ASML, NVDA");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ allocations?: Allocation[]; summary?: { total_allocated?: number; cash_remaining?: number }; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const watchlist = watchlistInput.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const res = await apiFetch("/signals/allocate", {
        method: "POST",
        body: JSON.stringify({ budget, currency, risk_profile: riskProfile, watchlist }),
      });
      if (res.success) {
        setResult(res.data);
      } else {
        setResult({ error: res.error || "Allocatie mislukt" });
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Onbekende fout" });
    } finally {
      setLoading(false);
    }
  };

  const ratio = result?.summary?.total_allocated && budget
    ? Math.min(100, (result.summary.total_allocated / budget) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader />

      <main className="max-w-5xl w-full mx-auto p-4 lg:p-6 flex-1">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">Portfoliobuilder</h2>
          <p className="text-sm text-slate-400 mt-1">Geef een budget en watchlist. De AI adviseert hoe je het kunt verdelen.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl space-y-4 mb-6">
          <div className="flex items-center gap-2 mb-2 border-b border-white/5 pb-3">
            <div className="bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/30">
              <PieChart className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Allocatie Parameters</h3>
              <p className="text-xs text-slate-400">Budget, valuta, risico en selectie</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Budget</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                min={1}
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Valuta</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Risicoprofiel</label>
            <div className="grid grid-cols-3 gap-2">
              {["conservative", "moderate", "aggressive"].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setRiskProfile(level)}
                  className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    riskProfile === level
                      ? "bg-cyan-500 text-[#0A0A0B] shadow"
                      : "bg-[#0A0A0B] border border-white/10 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {level === "conservative" ? "Conservatief" : level === "moderate" ? "Gematigd" : "Aggressief"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Watchlist (komma-gescheiden)</label>
            <input
              type="text"
              value={watchlistInput}
              onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-5 py-2.5 text-xs font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2 shadow-md"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 fill-slate-950" />}
              {loading ? "Analyseren..." : "Genereer allocatie"}
            </button>
          </div>
        </form>

        {result?.error && (
          <div className="mb-6 bg-rose-950/40 border border-rose-800/80 rounded-lg p-4 text-rose-400 flex items-center gap-3 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {result.error}
          </div>
        )}

        {result?.allocations && (
          <div className="space-y-4">
            <div className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-cyan-400" />
                Samenvatting
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 mb-3">
                <div className="bg-[#0A0A0B] rounded-lg p-3 border border-white/5">
                  <p className="text-[10px] text-slate-500 uppercase">Totaal gealloceerd</p>
                  <p className="text-xl font-bold text-white font-mono">{formatCurrency(result.summary?.total_allocated, currency)}</p>
                </div>
                <div className="bg-[#0A0A0B] rounded-lg p-3 border border-white/5">
                  <p className="text-[10px] text-slate-500 uppercase">Cash over</p>
                  <p className="text-xl font-bold text-emerald-400 font-mono">{formatCurrency(result.summary?.cash_remaining, currency)}</p>
                </div>
              </div>
              <div className="h-2.5 w-full bg-[#0A0A0B] rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                  style={{ width: `${ratio}%` }}
                />
              </div>
            </div>

            {result.allocations.map((alloc, idx) => {
              const isBuy = alloc.direction === "BUY";
              const isSell = alloc.direction === "SELL";
              const Icon = isBuy ? TrendingUp : isSell ? TrendingDown : Minus;
              const badgeClass = isBuy
                ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400"
                : isSell
                ? "bg-rose-950/40 border-rose-800/40 text-rose-400"
                : "bg-blue-950/40 border-blue-800/40 text-blue-400";

              return (
                <div key={idx} className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white font-mono">{alloc.symbol}</span>
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${badgeClass}`}>
                        <Icon className="w-3 h-3" />
                        {alloc.direction}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-cyan-400">Confidence: {(alloc.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs font-mono sm:grid-cols-4">
                    <div className="bg-[#0A0A0B] rounded p-2 border border-white/5">
                      <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Budget</span>
                      <span className="text-white font-semibold">{formatCurrency(alloc.allocated_budget, currency)}</span>
                    </div>
                    <div className="bg-[#0A0A0B] rounded p-2 border border-white/5">
                      <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Aantal</span>
                      <span className="text-white font-semibold">{alloc.quantity}</span>
                    </div>
                    <div className="bg-[#0A0A0B] rounded p-2 border border-white/5">
                      <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Entry</span>
                      <span className="text-white font-semibold">${alloc.entry_price.toFixed(2)}</span>
                    </div>
                    <div className="bg-[#0A0A0B] rounded p-2 border border-white/5">
                      <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Stop loss</span>
                      <span className="text-rose-400 font-semibold">${alloc.stop_loss.toFixed(2)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{alloc.thesis}</p>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="mt-auto bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS PRO. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
    </div>
  );
}

function formatCurrency(value: number | undefined, currency: string) {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(value);
}
