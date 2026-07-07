"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getResearchProposals } from "@/lib/supabase/api";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ResearchProposal {
  id: string;
  symbol: string;
  direction: "BUY" | "HOLD" | "SELL";
  entry_price: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  quantity: number | null;
  suggested_amount: number | null;
  confidence: number | null;
  thesis: string | null;
  currency: string | null;
  generated_at: string;
}

export default function LatestResearchProposals() {
  const [proposals, setProposals] = useState<ResearchProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResearchProposals({ limit: 3 })
      .then((data) => {
        setProposals(Array.isArray(data) ? data.slice(0, 3) : []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Laden mislukt");
      })
      .finally(() => setLoading(false));
  }, []);

  const formatPrice = (value: number | null, currency: string | null) =>
    value !== null && value !== undefined ? `${value.toFixed(2)} ${currency || ""}` : "—";

  if (loading) {
    return <p className="text-sm text-slate-400">Laatste onderzoeksvoorstellen laden...</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-400">{error}</p>;
  }

  if (proposals.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#0A0A0B] p-5">
        <p className="text-sm text-slate-400">
          Nog geen onderzoeksvoorstellen.{" "}
          <Link href="/onderzoek" className="font-medium text-cyan-400 hover:text-cyan-300">
            Genereer je eerste advies
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {proposals.map((p) => {
        const isBuy = p.direction === "BUY";
        const isSell = p.direction === "SELL";
        const Icon = isBuy ? TrendingUp : isSell ? TrendingDown : Minus;
        const badgeClass = isBuy
          ? "bg-emerald-950/40 border-emerald-800/40 text-emerald-400"
          : isSell
          ? "bg-rose-950/40 border-rose-800/40 text-rose-400"
          : "bg-blue-950/40 border-blue-800/40 text-blue-400";
        return (
          <Link
            key={p.id}
            href="/onderzoek"
            className="rounded-xl border border-white/5 bg-[#0A0A0B] p-4 hover:border-cyan-500/30 transition-all"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white font-mono">{p.symbol}</span>
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${badgeClass}`}>
                  <Icon className="w-3 h-3" />
                  {p.direction === "BUY" ? "Koop" : p.direction === "SELL" ? "Verkoop" : "Hold"}
                </span>
              </div>
              {p.confidence !== null && p.confidence !== undefined && (
                <span className="text-xs font-mono text-cyan-400">{(p.confidence * 100).toFixed(0)}%</span>
              )}
            </div>
            <p className="mb-3 text-xs text-slate-300 line-clamp-3 leading-relaxed">{p.thesis || "Geen beschrijving."}</p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#151518] rounded p-2 border border-white/5">
                <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Entry</span>
                <span className="text-white font-medium">{formatPrice(p.entry_price, p.currency)}</span>
              </div>
              <div className="bg-[#151518] rounded p-2 border border-white/5">
                <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Stop</span>
                <span className="text-rose-400 font-medium">{formatPrice(p.stop_loss, p.currency)}</span>
              </div>
              <div className="bg-[#151518] rounded p-2 border border-white/5">
                <span className="block text-[9px] text-slate-500 uppercase mb-0.5">TP1</span>
                <span className="text-emerald-400 font-medium">{formatPrice(p.take_profit_1, p.currency)}</span>
              </div>
              <div className="bg-[#151518] rounded p-2 border border-white/5">
                <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Bedrag</span>
                <span className="text-white font-medium">{formatPrice(p.suggested_amount, p.currency)}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
