"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSignals, generateSignal, approveSignal, rejectSignal, executeSignal, getBrokerStatus } from "@/lib/supabase/api";

interface SignalItem {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number | null;
  stop_loss: number | null;
  confidence: number | null;
  status: string;
  generated_at: string;
  analysis: any;
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
          <div className="flex items-center gap-4">
            <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${brokerMode === "paper" ? "bg-blue-100 text-blue-700" : brokerMode === "live" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-600"}`}>
              {brokerName} {brokerMode}
            </span>
            <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Terug naar dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-zinc-900">Signalen</h2>
          <p className="text-zinc-600">
            AI-generated trade setups. Jij keurt goed of af.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="mb-8 flex items-end gap-4">
          <div className="flex-1">
            <label htmlFor="symbol" className="block text-sm font-medium text-zinc-700">
              Symbool
            </label>
            <input
              id="symbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
              placeholder="Bijv. AAPL, TSLA, ASML"
            />
          </div>
          <button
            type="submit"
            disabled={generating}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {generating ? "Genereren..." : "Genereer signaal"}
          </button>
        </form>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {signals.length === 0 && !loading && (
            <p className="text-sm text-zinc-500">Nog geen signalen.</p>
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

  const badgeColor = isNoTrade
    ? "bg-slate-100 text-slate-700"
    : isReview
    ? "bg-amber-100 text-amber-700"
    : isBullish
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";

  const directionLabel = signal.direction || status?.replace("_", " ") || "ADVIES";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-lg font-bold ${isBullish ? "text-green-600" : isNoTrade || isReview ? "text-zinc-700" : "text-red-600"}`}>
            {signal.symbol}
          </span>
          <span className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${badgeColor}`}>
            {directionLabel}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 capitalize">
            {statusLabels[signal.status] || signal.status}
          </span>
        </div>
        {signal.confidence !== null && signal.confidence !== undefined && (
          <span className="text-sm text-zinc-500">
            Confidence: {(signal.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {isTradeIntent && (
        <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-zinc-500">Entry</p>
            <p className="font-medium text-zinc-900">{signal.entry_price ? `$${signal.entry_price}` : "—"}</p>
          </div>
          <div>
            <p className="text-zinc-500">Stop loss</p>
            <p className="font-medium text-zinc-900">{signal.stop_loss ? `$${signal.stop_loss}` : "—"}</p>
          </div>
          <div>
            <p className="text-zinc-500">Genereerd</p>
            <p className="font-medium text-zinc-900">
              {new Date(signal.generated_at).toLocaleString("nl-NL")}
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 text-sm text-zinc-700 leading-relaxed">
        {signal.analysis?.thesis || "Geen analyse beschikbaar."}
      </div>

      {(() => {
        const inv = signal.analysis?.invalidation_conditions;
        const conditions: string[] = Array.isArray(inv) ? inv : inv ? [String(inv)] : [];
        return conditions.length > 0 ? (
          <div className="mb-4 text-xs text-zinc-500">
            <p className="font-medium text-zinc-600 mb-1">Invalidatie:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              {conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null;
      })()}

      {isTradeIntent && signal.status === "generated" && (
        <div className="flex gap-3">
          <button
            onClick={onApprove}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Goedkeuren
          </button>
          <button
            onClick={onReject}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Afwijzen
          </button>
        </div>
      )}

      {isTradeIntent && signal.status === "approved" && (
        <div className="flex gap-3">
          <button
            onClick={onExecute}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Uitvoeren (paper)
          </button>
          <button
            onClick={onReject}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Afwijzen
          </button>
        </div>
      )}
    </div>
  );
}
