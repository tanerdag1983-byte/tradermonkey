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
      const result = await updateProposalStatus(proposalId, newStatus);
      // Update local state
      if (newStatus === "approved" || newStatus === "rejected") {
        // Update allocated
        setAllocated((prev) =>
          prev.map((p) => (p.id === proposalId ? { ...p, status: newStatus } : p))
        );
        // Update alsoInteresting
        setAlsoInteresting((prev) =>
          prev.map((p) => (p.id === proposalId ? { ...p, status: newStatus } : p))
        );
        // Update storedProposals
        setStoredProposals((prev) =>
          prev.map((p) => (p.id === proposalId ? { ...p, status: newStatus } : p))
        );
      }
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
            <Link
              href="/settings/research"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
            >
              Onderzoeksinstellingen
            </Link>
            <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Terug naar dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-zinc-900">Onderzoeksvoorstellen</h2>
          <p className="text-zinc-600">
            Geef je budget, watchlist en horizon. De AI geeft aan welke aandelen je hoeveel inlegt.
          </p>
        </div>

        <div className="mb-6 flex gap-2">
          {(["daily", "weekly", "monthly"] as Frequency[]).map((freq) => (
            <button
              key={freq}
              onClick={() => setActiveTab(freq)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                activeTab === freq
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {freqLabels[freq]}
            </button>
          ))}
        </div>

        <div className="mb-8 grid gap-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm md:grid-cols-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700">Totaal budget</label>
            <input
              type="number"
              min="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
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
          <div>
            <label className="block text-sm font-medium text-zinc-700">Risicoprofiel</label>
            <select
              value={riskProfile}
              onChange={(e) => setRiskProfile(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            >
              <option value="conservative">Conservatief</option>
              <option value="moderate">Gematigd</option>
              <option value="aggressive">Aggressief</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-zinc-700">Watchlist (kommagescheiden)</label>
            <input
              type="text"
              value={watchlistInput}
              onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
              placeholder="Bijv. AAPL,MSFT,TSLA,NVDA"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Bewaar je standaard watchlist in{" "}
              <Link href="/settings/research" className="underline">
                Instellingen
              </Link>
              . Laat leeg om op sectoren te filteren.
            </p>
          </div>
          <div className="md:col-span-5">
            <label className="mb-2 block text-sm font-medium text-zinc-700">Of selecteer sectoren</label>
            <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-5">
              {sectorData?.sectors.map((sector) => (
                <label
                  key={sector}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    selectedSectors.includes(sector)
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-300 bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSectors.includes(sector)}
                    onChange={() => toggleSector(sector)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                  />
                  <span className="capitalize text-zinc-700">{sector.replace("_", " ")}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-5 flex items-end justify-end">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {generating ? "Genereren..." : `Genereer ${freqLabels[activeTab].toLowerCase()}e voorstel`}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {allocationSummary && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-zinc-700">Budgetverdeling ({allocationSummary.total_allocated.toFixed(2)} / {Number(budget).toFixed(2)} {currency})</h3>
            <div className="mt-2 h-2 w-full rounded-full bg-zinc-100">
              <div
                className="h-2 rounded-full bg-zinc-900"
                style={{
                  width: `${Math.min(100, (allocationSummary.total_allocated / (Number(budget) || 1)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-sm text-zinc-500">
              Resterend: {allocationSummary.remaining_budget.toFixed(2)} {currency}
              {lastGenerated && ` · gegenereerd op ${lastGenerated.toLocaleString("nl-NL")}`}
            </p>
          </div>
        )}

        {allocated.length > 0 && (
          <section className="mb-10">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900">Mijn voorstellen</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {allocated.map((p) => (
                <AllocatedCard
                  key={p.id}
                  proposal={p}
                  formatCurrency={formatCurrency}
                  onApprove={() => handleStatusUpdate(p.id, "approved")}
                  onReject={() => handleStatusUpdate(p.id, "rejected")}
                  updating={updatingProposal === p.id}
                />
              ))}
            </div>
          </section>
        )}

        {alsoInteresting.length > 0 && (
          <section className="mb-10">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900">Misschien ook interessant</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {alsoInteresting.map((p) => (
                <InterestingCard
                  key={p.id}
                  proposal={p}
                  formatCurrency={formatCurrency}
                  onApprove={() => handleStatusUpdate(p.id, "approved")}
                  onReject={() => handleStatusUpdate(p.id, "rejected")}
                  updating={updatingProposal === p.id}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-4 text-lg font-semibold text-zinc-900">Eerder gegenereerd</h3>
          {loading ? (
            <p className="text-zinc-500">Laden...</p>
          ) : storedProposals.length === 0 ? (
            <p className="text-sm text-zinc-500">Nog geen opgeslagen voorstellen voor deze periode.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {storedProposals.map((p) => (
                <StoredProposalCard
                  key={p.id}
                  proposal={p}
                  formatCurrency={formatCurrency}
                  onApprove={() => handleStatusUpdate(p.id, "approved")}
                  onReject={() => handleStatusUpdate(p.id, "rejected")}
                  updating={updatingProposal === p.id}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function badgeColor(direction: string) {
  return direction === "BUY"
    ? "bg-green-100 text-green-700"
    : direction === "SELL"
    ? "bg-red-100 text-red-700"
    : "bg-zinc-100 text-zinc-700";
}

function AllocatedCard({
  proposal,
  formatCurrency,
  onApprove,
  onReject,
  updating,
}: {
  proposal: AllocatedProposal;
  formatCurrency: (value: number | null | undefined, curr?: string) => string;
  onApprove: () => void;
  onReject: () => void;
  updating: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-zinc-900">{proposal.symbol}</span>
          <span className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${badgeColor(proposal.direction)}`}>
            {proposal.direction === "BUY" ? "Koop" : proposal.direction === "SELL" ? "Verkoop" : "Hold"}
          </span>
        </div>
        {proposal.confidence !== null && proposal.confidence !== undefined && (
          <span className="text-xs text-zinc-500">
            {(proposal.confidence * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>

      <p className="mb-4 text-sm text-zinc-700 leading-relaxed">
        {proposal.thesis || "Geen beschrijving beschikbaar."}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-zinc-500">Entry</p>
          <p className="font-medium text-zinc-900">{formatCurrency(proposal.entry_price, proposal.currency || undefined)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Stop loss</p>
          <p className="font-medium text-zinc-900">{formatCurrency(proposal.stop_loss, proposal.currency || undefined)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Take profit 1</p>
          <p className="font-medium text-zinc-900">{formatCurrency(proposal.take_profit_1, proposal.currency || undefined)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Take profit 2</p>
          <p className="font-medium text-zinc-900">{formatCurrency(proposal.take_profit_2, proposal.currency || undefined)}</p>
        </div>
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Inleggen</span>
          <span className="font-semibold text-zinc-900">{formatCurrency(proposal.allocated_amount, proposal.currency || undefined)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Aantal aandelen</span>
          <span className="font-semibold text-zinc-900">{proposal.quantity}</span>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onApprove}
          disabled={updating || proposal.status === "approved"}
          className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-zinc-300"
        >
          {proposal.status === "approved" ? "Goedgekeurd" : "Goedkeuren"}
        </button>
        <button
          onClick={onReject}
          disabled={updating || proposal.status === "rejected"}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
        >
          {proposal.status === "rejected" ? "Afgewezen" : "Afwijzen"}
        </button>
      </div>
    </div>
  );
}

function InterestingCard({
  proposal,
  formatCurrency,
  onApprove,
  onReject,
  updating,
}: {
  proposal: InterestingProposal;
  formatCurrency: (value: number | null | undefined, curr?: string) => string;
  onApprove: () => void;
  onReject: () => void;
  updating: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm opacity-90">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-900">{proposal.symbol}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${badgeColor(proposal.direction)}`}>
            {proposal.direction}
          </span>
        </div>
        {proposal.confidence !== null && proposal.confidence !== undefined && (
          <span className="text-xs text-zinc-500">{(proposal.confidence * 100).toFixed(0)}%</span>
        )}
      </div>
      <p className="text-sm text-zinc-700 leading-relaxed">{proposal.thesis}</p>
      <div className="mt-3 flex gap-4 text-xs text-zinc-600">
        <span>Entry {formatCurrency(proposal.entry_price, proposal.currency || undefined)}</span>
        <span>SL {formatCurrency(proposal.stop_loss, proposal.currency || undefined)}</span>
        <span>TP {formatCurrency(proposal.take_profit_1, proposal.currency || undefined)}</span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onApprove}
          disabled={updating || proposal.status === "approved"}
          className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:bg-zinc-300"
        >
          {proposal.status === "approved" ? "Goedgekeurd" : "Goedkeuren"}
        </button>
        <button
          onClick={onReject}
          disabled={updating || proposal.status === "rejected"}
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
        >
          {proposal.status === "rejected" ? "Afgewezen" : "Afwijzen"}
        </button>
      </div>
    </div>
  );
}

function StoredProposalCard({
  proposal,
  formatCurrency,
  onApprove,
  onReject,
  updating,
}: {
  proposal: StoredProposal;
  formatCurrency: (value: number | null | undefined, curr?: string) => string;
  onApprove: () => void;
  onReject: () => void;
  updating: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-zinc-900">{proposal.symbol}</span>
          <span className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${badgeColor(proposal.direction)}`}>
            {proposal.direction}
          </span>
        </div>
        {proposal.confidence !== null && proposal.confidence !== undefined && (
          <span className="text-xs text-zinc-500">{(proposal.confidence * 100).toFixed(0)}% confidence</span>
        )}
      </div>
      <p className="mb-4 text-sm text-zinc-700 leading-relaxed">{proposal.thesis || "Geen beschrijving beschikbaar."}</p>
      <div className="mb-2 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-zinc-500">Entry</p>
          <p className="font-medium text-zinc-900">{formatCurrency(proposal.entry_price, proposal.currency || undefined)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Stop loss</p>
          <p className="font-medium text-zinc-900">{formatCurrency(proposal.stop_loss, proposal.currency || undefined)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Take profit 1</p>
          <p className="font-medium text-zinc-900">{formatCurrency(proposal.take_profit_1, proposal.currency || undefined)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Take profit 2</p>
          <p className="font-medium text-zinc-900">{formatCurrency(proposal.take_profit_2, proposal.currency || undefined)}</p>
        </div>
      </div>
      <div className="border-t border-zinc-100 pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Voorgesteld bedrag</span>
          <span className="font-medium text-zinc-900">{formatCurrency(proposal.suggested_amount, proposal.currency || undefined)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Aantal</span>
          <span className="font-medium text-zinc-900">{proposal.quantity ?? "—"}</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-zinc-400">{new Date(proposal.generated_at).toLocaleString("nl-NL")}</p>

      {proposal.status !== "approved" && proposal.status !== "rejected" && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={onApprove}
            disabled={updating}
            className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Goedkeuren
          </button>
          <button
            onClick={onReject}
            disabled={updating}
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Afwijzen
          </button>
        </div>
      )}

      {(proposal.status === "approved" || proposal.status === "rejected") && (
        <div className="mt-4">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              proposal.status === "approved"
                ? "bg-green-100 text-green-700"
                : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {proposal.status === "approved" ? "Goedgekeurd" : "Afgewezen"}
          </span>
        </div>
      )}
    </div>
  );
}
