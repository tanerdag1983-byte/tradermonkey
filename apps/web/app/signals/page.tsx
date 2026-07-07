"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/app-header";
import MarketChart from "@/components/market-chart";
import { getSignals, generateSignal, approveSignal, rejectSignal, executeSignal, getBrokerStatus } from "@/lib/supabase/api";
import { Zap, Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, PlayCircle, XCircle, CheckCircle } from "lucide-react";

interface SignalAnalysis {
  status?: string;
  thesis?: string;
  invalidation_conditions?: string[] | string;
}

interface SignalItem {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number | null;
  stop_loss: number | null;
  confidence: number | null;
  status: string;
  generated_at: string;
  analysis: SignalAnalysis | null;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [symbol, setSymbol] = useState("AAPL");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broker, setBroker] = useState<{ broker?: { name: string; mode: string }; success?: boolean; error?: string } | null>(null);

  const loadSignals = async () => {
    try {
      const [signalsResult, brokerResult] = await Promise.all([getSignals(), getBrokerStatus()]);
      if (signalsResult.success) {
        setSignals(signalsResult.data);
      }
      setBroker(brokerResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load signals");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const result = await generateSignal(symbol);
      if (result.success) {
        await loadSignals();
      } else {
        setError(result.error || "Signal generation failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signal generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveSignal(id);
      await loadSignals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectSignal(id);
      await loadSignals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    }
  };

  const handleExecute = async (id: string) => {
    setError(null);
    try {
      const result = await executeSignal(id);
      if (!result.success) {
        setError(result.error || "Execution failed");
      }
      await loadSignals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed");
    }
  };

  const brokerMode = broker?.broker?.mode || "none";
  const brokerName = broker?.broker?.name || "none";

  useEffect(() => {
    loadSignals();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader />

      <main className="max-w-7xl w-full mx-auto p-4 lg:p-6 flex-1">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Signalen</h2>
            <p className="text-sm text-slate-400 mt-1">AI-generated trade setups. Jij keurt goed of af.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase border ${
              brokerMode === "paper"
                ? "bg-blue-950/40 border-blue-800/40 text-blue-400"
                : brokerMode === "live"
                ? "bg-rose-950/40 border-rose-800/40 text-rose-400"
                : "bg-zinc-800 text-slate-400 border-white/5"
            }`}>
              {brokerName} {brokerMode}
            </span>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="bg-[#151518] border border-white/5 rounded-xl p-4 shadow-xl mb-6 flex flex-col sm:flex-row items-end gap-4">
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">Symbool</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
              placeholder="Bijv. AAPL, TSLA, ASML"
            />
          </div>
          <button
            type="submit"
            disabled={generating}
            className="w-full sm:w-auto rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-5 py-2.5 text-xs font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-md"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-slate-950" />}
            {generating ? "Genereren..." : "Genereer signaal"}
          </button>
        </form>

        {error && (
          <div className="mb-6 bg-rose-950/40 border border-rose-800/80 rounded-lg p-4 text-rose-400 flex items-center gap-3 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-6 bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Grafiek {symbol}
          </h3>
          <div className="bg-[#0A0A0B] rounded-lg border border-white/5">
            <MarketChart symbol={symbol} />
          </div>
        </div>

        <div className="space-y-4">
          {signals.length === 0 && !loading && (
            <div className="bg-[#151518] border border-white/5 rounded-xl p-6 text-center">
              <p className="text-sm text-slate-400">Nog geen signalen.</p>
            </div>
          )}
          {signals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              onApprove={() => handleApprove(signal.id)}
              onReject={() => handleReject(signal.id)}
              onExecute={() => handleExecute(signal.id)}
            />
          ))}
        </div>
      </main>

      <footer className="mt-auto bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS PRO. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  generated: "AI advies",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
};

function SignalCard({
  signal,
  onApprove,
  onReject,
  onExecute,
}: {
  signal: SignalItem;
  onApprove: () => void;
  onReject: () => void;
  onExecute: () => void;
}) {
  const status = signal.analysis?.status as string | undefined;
  const isTradeIntent = status === "TRADE_INTENT";
  const isNoTrade = status === "NO_TRADE";
  const isReview = status === "REVIEW_REQUIRED";
  const isBullish = signal.direction === "BUY";

  const badgeClass = isNoTrade
    ? "bg-zinc-800 border-white/5 text-slate-400"
    : isReview
    ? "bg-amber-950/40 border-amber-800/40 text-amber-400"
    : isBullish
    ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400"
    : "bg-rose-950/40 border-rose-800/40 text-rose-400";

  const directionLabel = signal.direction || status?.replace("_", " ") || "ADVIES";
  const Icon = isBullish ? TrendingUp : isNoTrade || isReview ? Minus : TrendingDown;

  return (
    <div className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white font-mono">{signal.symbol}</span>
          <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase border ${badgeClass}`}>
            <Icon className="w-3 h-3" />
            {directionLabel}
          </span>
          <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-400 border border-white/5 capitalize">
            {statusLabels[signal.status] || signal.status}
          </span>
        </div>
        {signal.confidence !== null && signal.confidence !== undefined && (
          <span className="text-xs font-mono text-cyan-400">
            Confidence: {(signal.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {isTradeIntent && (
        <div className="mb-4 grid grid-cols-3 gap-3 text-xs font-mono">
          <div className="bg-[#0A0A0B] rounded p-2 border border-white/5">
            <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Entry</span>
            <span className="text-white font-semibold">{signal.entry_price ? `$${signal.entry_price}` : "—"}</span>
          </div>
          <div className="bg-[#0A0A0B] rounded p-2 border border-white/5">
            <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Stop loss</span>
            <span className="text-rose-400 font-semibold">{signal.stop_loss ? `$${signal.stop_loss}` : "—"}</span>
          </div>
          <div className="bg-[#0A0A0B] rounded p-2 border border-white/5">
            <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Gegenereerd</span>
            <span className="text-white font-semibold">{new Date(signal.generated_at).toLocaleString("nl-NL")}</span>
          </div>
        </div>
      )}

      <div className="mb-4 text-xs text-slate-300 leading-relaxed font-sans">
        {signal.analysis?.thesis || "Geen analyse beschikbaar."}
      </div>

      {(() => {
        const inv = signal.analysis?.invalidation_conditions;
        const conditions: string[] = Array.isArray(inv) ? inv : inv ? [String(inv)] : [];
        return conditions.length > 0 ? (
          <div className="mb-4 text-[10px] text-slate-400 font-mono">
            <p className="font-bold text-slate-300 mb-1 uppercase tracking-wider">Invalidatie:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              {conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null;
      })()}

      {isTradeIntent && signal.status === "generated" && (
        <div className="flex gap-3 pt-3 border-t border-white/5">
          <button
            onClick={onApprove}
            className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 py-2 text-xs font-bold text-slate-950 hover:opacity-90 transition-all flex items-center justify-center gap-1"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Goedkeuren
          </button>
          <button
            onClick={onReject}
            className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 py-2 text-xs font-medium transition-all flex items-center justify-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" />
            Afwijzen
          </button>
        </div>
      )}

      {isTradeIntent && signal.status === "approved" && (
        <div className="flex gap-3 pt-3 border-t border-white/5">
          <button
            onClick={onExecute}
            className="flex-1 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 py-2 text-xs font-bold text-slate-950 hover:opacity-90 transition-all flex items-center justify-center gap-1"
          >
            <PlayCircle className="w-3.5 h-3.5 fill-slate-950" />
            Uitvoeren (paper)
          </button>
          <button
            onClick={onReject}
            className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 py-2 text-xs font-medium transition-all flex items-center justify-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" />
            Afwijzen
          </button>
        </div>
      )}
    </div>
  );
}
