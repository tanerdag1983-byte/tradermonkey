"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  generateResearch,
  getResearchProposals,
  getResearchSettings,
  getResearchSectors,
  updateProposalStatus,
} from "@/lib/supabase/api";
import AppHeader from "@/components/app-header";
import ProposalCard, { ProposalView } from "@/components/proposal-card";
import { Brain, Cpu, Sparkles, Loader2, AlertCircle, Settings, ArrowRight } from "lucide-react";

interface StoredProposal {
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
  risk_profile: string | null;
  status: string;
  frequency: string;
  generated_at: string;
}

interface SectorData {
  sectors: string[];
  symbols_by_sector: Record<string, string[]>;
  default_universe: string[];
}

interface AllocatedProposal {
  id: string;
  symbol: string;
  direction: "BUY" | "HOLD" | "SELL";
  entry_price: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  allocated_amount: number;
  quantity: number;
  confidence: number | null;
  thesis: string | null;
  currency: string | null;
  status?: string;
}

interface InterestingProposal {
  id: string;
  symbol: string;
  direction: "BUY" | "HOLD" | "SELL";
  entry_price: number | null;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  confidence: number | null;
  thesis: string | null;
  currency: string | null;
  status?: string;
}

type Frequency = "daily" | "weekly" | "monthly";

const freqLabels: Record<Frequency, string> = {
  daily: "Dagelijks",
  weekly: "Wekelijks",
  monthly: "Maandelijks",
};

export default function OnderzoekPage() {
  const [activeTab, setActiveTab] = useState<Frequency>("daily");
  const [storedProposals, setStoredProposals] = useState<StoredProposal[]>([]);
  const [allocated, setAllocated] = useState<AllocatedProposal[]>([]);
  const [alsoInteresting, setAlsoInteresting] = useState<InterestingProposal[]>([]);
  const [allocationSummary, setAllocationSummary] = useState<{ total_allocated: number; remaining_budget: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);
  const [updatingProposal, setUpdatingProposal] = useState<string | null>(null);

  const [budget, setBudget] = useState<string>("1000");
  const [currency, setCurrency] = useState<string>("EUR");
  const [riskProfile, setRiskProfile] = useState<string>("moderate");
  const [watchlistInput, setWatchlistInput] = useState<string>("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [sectorData, setSectorData] = useState<SectorData | null>(null);

  const loadSettingsAndProposals = async () => {
    try {
      const [settings, proposalsResult, sectors] = await Promise.all([
        getResearchSettings(),
        getResearchProposals({ frequency: activeTab, limit: 100 }),
        getResearchSectors(),
      ]);
      setSectorData(sectors);
      if (settings.budget) setBudget(String(settings.budget));
      if (settings.currency) setCurrency(settings.currency);
      if (settings.risk_profile) setRiskProfile(settings.risk_profile);
      if (Array.isArray(settings.watchlist)) {
        setWatchlistInput(settings.watchlist.join(","));
      }
      if (Array.isArray(settings.sectors)) {
        setSelectedSectors(settings.sectors);
      }
      setStoredProposals(Array.isArray(proposalsResult) ? proposalsResult : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load research");
    } finally {
      setLoading(false);
    }
  };

  const toggleSector = (sector: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  };

  const handleGenerate = async () => {
    setError(null);
    const watchlist = watchlistInput
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (watchlist.length === 0 && selectedSectors.length === 0) {
      setError("Voeg aandelen toe aan je watchlist of selecteer minimaal één sector.");
      return;
    }

    setGenerating(true);
    try {
      const result = await generateResearch({
        watchlist: watchlist.length > 0 ? watchlist : undefined,
        sectors: watchlist.length === 0 && selectedSectors.length > 0 ? selectedSectors : undefined,
        budget: Number(budget) || 0,
        currency,
        risk_profile: riskProfile,
        frequency: activeTab,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setAllocated(Array.isArray(result.allocated) ? result.allocated : []);
        setAlsoInteresting(Array.isArray(result.also_interesting) ? result.also_interesting : []);
        if (result.total_allocated !== undefined && result.remaining_budget !== undefined) {
          setAllocationSummary({
            total_allocated: result.total_allocated,
            remaining_budget: result.remaining_budget,
          });
        }
        setLastGenerated(new Date());
        await loadSettingsAndProposals();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generatie mislukt");
    } finally {
      setGenerating(false);
    }
  };

  const handleStatusUpdate = async (proposalId: string, newStatus: "approved" | "rejected") => {
    setUpdatingProposal(proposalId);
    try {
      await updateProposalStatus(proposalId, newStatus);
      setAllocated((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: newStatus } : p))
      );
      setAlsoInteresting((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: newStatus } : p))
      );
      setStoredProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: newStatus } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update mislukt");
    } finally {
      setUpdatingProposal(null);
    }
  };

  useEffect(() => {
    loadSettingsAndProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const formatCurrency = (value: number | null | undefined, curr = currency) =>
    value !== null && value !== undefined ? `${value.toFixed(2)} ${curr}` : "—";

  const budgetNum = Number(budget) || 1;
  const allocatedRatio = allocationSummary
    ? Math.min(100, (allocationSummary.total_allocated / budgetNum) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader />

      <main className="max-w-7xl w-full mx-auto p-4 lg:p-6 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Onderzoeksvoorstellen</h2>
            <p className="text-sm text-slate-400 mt-1">
              Geef je budget, watchlist en horizon. De AI geeft aan welke aandelen je hoeveel inlegt.
            </p>
          </div>
          <Link
            href="/settings/research"
            className="inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400" />
            Onderzoeksinstellingen
            <ArrowRight className="w-3 h-3 text-slate-500" />
          </Link>
        </div>

        {/* Frequency tabs */}
        <div className="bg-[#151518] border border-white/5 rounded-xl p-3 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-2.5 mb-2.5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Horizone & Frequentie
            </h4>
            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2.5 py-0.5 rounded font-semibold">
              Model: AI Portfolio Builder
            </span>
          </div>
          <div className="flex gap-2">
            {(["daily", "weekly", "monthly"] as Frequency[]).map((freq) => {
              const active = activeTab === freq;
              return (
                <button
                  key={freq}
                  onClick={() => setActiveTab(freq)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                    active
                      ? "bg-cyan-500 text-[#0A0A0B] shadow"
                      : "bg-[#0A0A0B] hover:bg-white/5 text-slate-300 border border-white/5"
                  }`}
                >
                  {freqLabels[freq]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Parameters panel */}
        <div className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
          <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
            <div className="bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/30">
              <Brain className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Parameters Instellen</h3>
              <p className="text-xs text-slate-400">Beheer budget, valuta, risico en universum</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                Totaal budget
              </label>
              <input
                type="number"
                min="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                Valuta
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                Risicoprofiel
              </label>
              <select
                value={riskProfile}
                onChange={(e) => setRiskProfile(e.target.value)}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="conservative">Conservatief</option>
                <option value="moderate">Gematigd</option>
                <option value="aggressive">Aggressief</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                Watchlist (kommagescheiden)
              </label>
              <input
                type="text"
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
                placeholder="Bijv. AAPL,MSFT,TSLA,NVDA"
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">
              Of selecteer sectoren
            </label>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {sectorData?.sectors.map((sector) => {
                const checked = selectedSectors.includes(sector);
                return (
                  <button
                    key={sector}
                    onClick={() => toggleSector(sector)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-all cursor-pointer ${
                      checked
                        ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400"
                        : "bg-[#0A0A0B] border-white/10 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? "bg-cyan-500 border-cyan-500 text-[#0A0A0B]" : "border-white/20"}`}>
                      {checked && "✓"}
                    </span>
                    <span className="capitalize">{sector.replace("_", " ")}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 hover:opacity-90 text-slate-950 font-bold px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyseren...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-slate-950" />
                  Genereer {freqLabels[activeTab].toLowerCase()}e voorstel
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-950/40 border border-rose-800/80 rounded-lg p-4 text-rose-400 flex items-center gap-3 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {allocationSummary && (
          <div className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Budgetverdeling</h3>
              <span className="text-xs font-mono text-cyan-400">
                {allocationSummary.total_allocated.toFixed(2)} / {budgetNum.toFixed(2)} {currency}
              </span>
            </div>
            <div className="h-2.5 w-full bg-[#0A0A0B] rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full"
                style={{ width: `${allocatedRatio}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Resterend: {allocationSummary.remaining_budget.toFixed(2)} {currency}
              {lastGenerated && ` · gegenereerd op ${lastGenerated.toLocaleString("nl-NL")}`}
            </p>
          </div>
        )}

        {allocated.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Mijn voorstellen
            </h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {allocated.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={{
                    ...p,
                    suggested_amount: null,
                    generated_at: undefined,
                  } as ProposalView}
                  formatCurrency={formatCurrency}
                  onApprove={() => handleStatusUpdate(p.id, "approved")}
                  onReject={() => handleStatusUpdate(p.id, "rejected")}
                  updating={updatingProposal === p.id}
                  variant="allocated"
                />
              ))}
            </div>
          </section>
        )}

        {alsoInteresting.length > 0 && (
          <section>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <Brain className="w-4 h-4 text-cyan-400" />
              Misschien ook interessant
            </h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {alsoInteresting.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={{
                    ...p,
                    allocated_amount: 0,
                    quantity: null,
                    suggested_amount: null,
                    generated_at: undefined,
                  } as ProposalView}
                  formatCurrency={formatCurrency}
                  onApprove={() => handleStatusUpdate(p.id, "approved")}
                  onReject={() => handleStatusUpdate(p.id, "rejected")}
                  updating={updatingProposal === p.id}
                  variant="interesting"
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-cyan-400" />
            Eerder gegenereerd
          </h3>
          {loading ? (
            <div className="bg-[#151518] border border-white/5 rounded-xl p-8 text-center">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-400">Voorstellen laden...</p>
            </div>
          ) : storedProposals.length === 0 ? (
            <div className="bg-[#151518] border border-white/5 rounded-xl p-6 text-center">
              <p className="text-sm text-slate-400">
                Nog geen opgeslagen voorstellen voor deze periode.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {storedProposals.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p as ProposalView}
                  formatCurrency={formatCurrency}
                  onApprove={() => handleStatusUpdate(p.id, "approved")}
                  onReject={() => handleStatusUpdate(p.id, "rejected")}
                  updating={updatingProposal === p.id}
                  variant="stored"
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mt-auto bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
    </div>
  );
}
