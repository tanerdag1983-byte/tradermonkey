"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/supabase/api";

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
  const [result, setResult] = useState<{ allocations?: Allocation[]; summary?: any; error?: string } | null>(null);

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

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold">TM</div>
              <h1 className="text-xl font-bold text-zinc-900">TraderMonkeys</h1>
            </Link>
          </div>
          <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">Terug naar dashboard</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-zinc-900">Portfoliobuilder</h2>
          <p className="text-zinc-600">Geef een budget en watchlist. De AI adviseert hoe je het kunt verdelen.</p>
        </div>

        <form onSubmit={handleSubmit} className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Budget</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Valuta</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Risicoprofiel</label>
            <select
              value={riskProfile}
              onChange={(e) => setRiskProfile(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            >
              <option value="conservative">Conservatief</option>
              <option value="moderate">Gemiddeld</option>
              <option value="aggressive">Aggressief</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">Watchlist (komma-gescheiden)</label>
            <input
              type="text"
              value={watchlistInput}
              onChange={(e) => setWatchlistInput(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Analyseren..." : "Genereer allocatie"}
          </button>
        </form>

        {result?.error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{result.error}</div>
        )}

        {result?.allocations && (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-zinc-900">Samenvatting</h3>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-zinc-500">Totaal gealloceerd</p>
                  <p className="text-xl font-bold text-zinc-900">€{result.summary?.total_allocated?.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Cash over</p>
                  <p className="text-xl font-bold text-zinc-900">€{result.summary?.cash_remaining?.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {result.allocations.map((alloc, idx) => (
              <div key={idx} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-zinc-900">{alloc.symbol}</span>
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">{alloc.direction}</span>
                  </div>
                  <span className="text-sm text-zinc-500">Confidence: {(alloc.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div><p className="text-zinc-500">Budget</p><p className="font-medium text-zinc-900">€{alloc.allocated_budget.toFixed(2)}</p></div>
                  <div><p className="text-zinc-500">Aantal</p><p className="font-medium text-zinc-900">{alloc.quantity}</p></div>
                  <div><p className="text-zinc-500">Entry</p><p className="font-medium text-zinc-900">${alloc.entry_price.toFixed(2)}</p></div>
                  <div><p className="text-zinc-500">Stop loss</p><p className="font-medium text-red-600">${alloc.stop_loss.toFixed(2)}</p></div>
                </div>
                <p className="text-sm text-zinc-700">{alloc.thesis}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
