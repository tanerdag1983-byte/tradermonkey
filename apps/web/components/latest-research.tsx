"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getResearchProposals } from "@/lib/supabase/api";

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
    return <p className="text-sm text-zinc-500">Laatste onderzoeksvoorstellen laden...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (proposals.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-zinc-600">
          Nog geen onderzoeksvoorstellen.{" "}
          <Link href="/onderzoek" className="font-medium text-zinc-900 underline">
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
        const badgeColor = isBuy
          ? "bg-green-100 text-green-700"
          : isSell
          ? "bg-red-100 text-red-700"
          : "bg-zinc-100 text-zinc-700";
        return (
          <Link
            key={p.id}
            href="/onderzoek"
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-zinc-300"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-zinc-900">{p.symbol}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${badgeColor}`}>
                  {p.direction === "BUY" ? "Koop" : p.direction === "SELL" ? "Verkoop" : "Hold"}
                </span>
              </div>
              {p.confidence !== null && p.confidence !== undefined && (
                <span className="text-xs text-zinc-500">{(p.confidence * 100).toFixed(0)}%</span>
              )}
            </div>
            <p className="mb-3 text-sm text-zinc-700 line-clamp-3">{p.thesis || "Geen beschrijving."}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <div>
                <span className="block text-zinc-400">Entry</span>
                <span className="font-medium text-zinc-900">{formatPrice(p.entry_price, p.currency)}</span>
              </div>
              <div>
                <span className="block text-zinc-400">Stop</span>
                <span className="font-medium text-zinc-900">{formatPrice(p.stop_loss, p.currency)}</span>
              </div>
              <div>
                <span className="block text-zinc-400">TP1</span>
                <span className="font-medium text-zinc-900">{formatPrice(p.take_profit_1, p.currency)}</span>
              </div>
              <div>
                <span className="block text-zinc-400">Bedrag</span>
                <span className="font-medium text-zinc-900">{formatPrice(p.suggested_amount, p.currency)}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
