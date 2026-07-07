"use client";

import { useState } from "react";
import MarketChart from "@/components/market-chart";
import { TrendingUp, Search } from "lucide-react";

export default function DashboardChart() {
  const [symbol, setSymbol] = useState("AAPL");
  const [input, setInput] = useState("AAPL");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      setSymbol(input.trim().toUpperCase());
    }
  };

  return (
    <div className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/30">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Marktgrafiek</h3>
            <p className="text-xs text-slate-400">Live OHLCV data via Alpaca</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            className="w-28 bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
            placeholder="Ticker"
          />
          <button
            type="submit"
            className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1"
          >
            <Search className="w-3.5 h-3.5" />
            Toon
          </button>
        </form>
      </div>

      <div className="bg-[#0A0A0B] rounded-lg border border-white/5">
        <MarketChart symbol={symbol} />
      </div>
    </div>
  );
}
