"use client";

import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";

export interface ProposalView {
  id: string;
  symbol: string;
  direction: "BUY" | "HOLD" | "SELL";
  entry_price: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  quantity: number | null;
  allocated_amount?: number;
  suggested_amount?: number | null;
  confidence: number | null;
  thesis: string | null;
  currency: string | null;
  status?: string;
  generated_at?: string;
}

interface ProposalCardProps {
  proposal: ProposalView;
  formatCurrency: (value: number | null | undefined, curr?: string) => string;
  onApprove: () => void;
  onReject: () => void;
  updating?: boolean;
  variant?: "allocated" | "interesting" | "stored";
}

function directionBadge(direction: string) {
  if (direction === "BUY") {
    return {
      text: "Koop",
      class:
        "bg-emerald-950/40 border-emerald-800/40 text-emerald-400",
      icon: TrendingUp,
    };
  }
  if (direction === "SELL") {
    return {
      text: "Verkoop",
      class: "bg-rose-950/40 border-rose-800/40 text-rose-400",
      icon: TrendingDown,
    };
  }
  return {
    text: "Hold",
    class: "bg-blue-950/40 border-blue-800/40 text-blue-400",
    icon: Minus,
  };
}

export default function ProposalCard({
  proposal,
  formatCurrency,
  onApprove,
  onReject,
  updating,
  variant = "stored",
}: ProposalCardProps) {
  const badge = directionBadge(proposal.direction);
  const Icon = badge.icon;

  const isApproved = proposal.status === "approved";
  const isRejected = proposal.status === "rejected";

  return (
    <div className="bg-[#0A0A0B] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white font-mono">{proposal.symbol}</span>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${badge.class}`}
          >
            <Icon className="w-3 h-3" />
            {badge.text}
          </span>
        </div>
        {proposal.confidence !== null && proposal.confidence !== undefined && (
          <span className="text-xs font-mono text-cyan-400">
            {(proposal.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      <p className="mb-4 text-xs text-slate-300 leading-relaxed font-sans line-clamp-4">
        {proposal.thesis || "Geen beschrijving beschikbaar."}
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="bg-[#151518] rounded p-2 border border-white/5">
          <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Entry</span>
          <span className="text-white font-semibold">
            {formatCurrency(proposal.entry_price, proposal.currency || undefined)}
          </span>
        </div>
        <div className="bg-[#151518] rounded p-2 border border-white/5">
          <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Stop loss</span>
          <span className="text-rose-400 font-semibold">
            {formatCurrency(proposal.stop_loss, proposal.currency || undefined)}
          </span>
        </div>
        <div className="bg-[#151518] rounded p-2 border border-white/5">
          <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Take profit 1</span>
          <span className="text-emerald-400 font-semibold">
            {formatCurrency(proposal.take_profit_1, proposal.currency || undefined)}
          </span>
        </div>
        <div className="bg-[#151518] rounded p-2 border border-white/5">
          <span className="block text-[9px] text-slate-500 uppercase mb-0.5">Take profit 2</span>
          <span className="text-emerald-300 font-semibold">
            {formatCurrency(proposal.take_profit_2, proposal.currency || undefined)}
          </span>
        </div>
      </div>

      {variant === "allocated" && (
        <div className="mb-3 bg-[#151518] rounded p-2 border border-white/5 text-xs font-mono">
          <div className="flex justify-between mb-1">
            <span className="text-slate-500">Inleggen</span>
            <span className="text-white font-semibold">
              {formatCurrency(proposal.allocated_amount ?? 0, proposal.currency || undefined)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Aantal</span>
            <span className="text-white font-semibold">{proposal.quantity ?? "—"}</span>
          </div>
        </div>
      )}

      {variant === "stored" && (
        <div className="mb-3 bg-[#151518] rounded p-2 border border-white/5 text-xs font-mono">
          <div className="flex justify-between mb-1">
            <span className="text-slate-500">Voorgesteld bedrag</span>
            <span className="text-white font-semibold">
              {formatCurrency(proposal.suggested_amount, proposal.currency || undefined)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Aantal</span>
            <span className="text-white font-semibold">{proposal.quantity ?? "—"}</span>
          </div>
          {proposal.generated_at && (
            <p className="mt-1.5 text-[10px] text-slate-500">
              {new Date(proposal.generated_at).toLocaleString("nl-NL")}
            </p>
          )}
        </div>
      )}

      {isApproved || isRejected ? (
        <div className="pt-2 border-t border-white/5">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
              isApproved
                ? "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40"
                : "bg-zinc-800 text-slate-400 border border-white/5"
            }`}
          >
            {isApproved ? "Goedgekeurd" : "Afgewezen"}
          </span>
        </div>
      ) : (
        <div className="pt-2 border-t border-white/5 flex gap-2">
          <button
            onClick={onApprove}
            disabled={updating}
            className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 hover:opacity-90 text-slate-950 font-bold py-2 text-xs flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50"
          >
            {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
            Goedkeuren
          </button>
          <button
            onClick={onReject}
            disabled={updating}
            className="flex-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-medium py-2 text-xs transition-all cursor-pointer disabled:opacity-50"
          >
            Afwijzen
          </button>
        </div>
      )}
    </div>
  );
}
