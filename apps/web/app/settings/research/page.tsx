"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getResearchSettings, getResearchSectors, updateResearchSettings, sendResearchDigest } from "@/lib/supabase/api";

interface SectorData {
  sectors: string[];
  symbols_by_sector: Record<string, string[]>;
  default_universe: string[];
}

export default function ResearchSettingsPage() {
  const [budget, setBudget] = useState<string>("1000");
  const [currency, setCurrency] = useState<string>("EUR");
  const [riskProfile, setRiskProfile] = useState<string>("moderate");
  const [watchlistInput, setWatchlistInput] = useState<string>("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [sectorData, setSectorData] = useState<SectorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [sendingDigest, setSendingDigest] = useState(false);

  const loadData = async () => {
    try {
      const [settings, sectors] = await Promise.all([getResearchSettings(), getResearchSectors()]);
      setSectorData(sectors);
      if (settings.budget !== undefined) setBudget(String(settings.budget));
      if (settings.currency) setCurrency(settings.currency);
      if (settings.risk_profile) setRiskProfile(settings.risk_profile);
      if (Array.isArray(settings.watchlist)) {
        setWatchlistInput(settings.watchlist.join(","));
      }
      if (Array.isArray(settings.sectors)) {
        setSelectedSectors(settings.sectors);
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Instellingen laden mislukt" });
    } finally {
      setLoading(false);
    }
  };

  const derivedSymbols = useMemo(() => {
    if (!sectorData) return [];
    const seen = new Set<string>();
    const symbols: string[] = [];
    selectedSectors.forEach((sector) => {
      (sectorData.symbols_by_sector[sector] || []).forEach((s) => {
        if (!seen.has(s)) {
          seen.add(s);
          symbols.push(s);
        }
      });
    });
    return symbols;
  }, [selectedSectors, sectorData]);

  const toggleSector = (sector: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const explicitWatchlist = watchlistInput
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      await updateResearchSettings({
        budget: Number(budget) || 0,
        currency,
        risk_profile: riskProfile,
        watchlist: explicitWatchlist,
        sectors: selectedSectors,
      });
      setMessage({ type: "success", text: "Onderzoeksinstellingen opgeslagen." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Opslaan mislukt" });
    } finally {
      setSaving(false);
    }
  };

  const handleSendDigest = async (frequency: string) => {
    setSendingDigest(true);
    setMessage(null);
    try {
      const result = await sendResearchDigest({ frequency, limit: 10 });
      if (result.sent) {
        setMessage({ type: "success", text: `Digest (${frequency}) verzonden naar je e-mail.` });
      } else {
        setMessage({ type: "error", text: result.detail || "Digest kon niet worden verzonden." });
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Digest verzenden mislukt" });
    } finally {
      setSendingDigest(false);
    }
  };

  useEffect(() => {
    loadData();
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
            <Link href="/onderzoek" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Onderzoek
            </Link>
            <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              Terug naar dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-zinc-900">Onderzoeksinstellingen</h2>
          <p className="text-zinc-600">
            Kies sectoren of vul een eigen watchlist in. De AI analyseert die set voor jou.
          </p>
        </div>

        {loading ? (
          <p className="text-zinc-500">Laden...</p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            {message && (
              <div
                className={`rounded-lg border p-4 text-sm ${
                  message.type === "success"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <label htmlFor="budget" className="block text-sm font-medium text-zinc-700">
                  Standaard budget
                </label>
                <input
                  id="budget"
                  type="number"
                  min="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                />
              </div>
              <div>
                <label htmlFor="currency" className="block text-sm font-medium text-zinc-700">
                  Valuta
                </label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label htmlFor="riskProfile" className="block text-sm font-medium text-zinc-700">
                  Risicoprofiel
                </label>
                <select
                  id="riskProfile"
                  value={riskProfile}
                  onChange={(e) => setRiskProfile(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                >
                  <option value="conservative">Conservatief</option>
                  <option value="moderate">Gematigd</option>
                  <option value="aggressive">Aggressief</option>
                </select>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-zinc-700">Eigen watchlist (optioneel)</h3>
              <input
                id="watchlist"
                type="text"
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
                className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                placeholder="Bijv. AAPL,MSFT,TSLA,NVDA"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Als je deze invult, gebruikt de AI alleen deze lijst.
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-zinc-700">Of kies sectoren</h3>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {sectorData?.sectors.map((sector) => (
                  <label
                    key={sector}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
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
                    <span className="text-sm font-medium capitalize text-zinc-700">
                      {sector.replace("_", " ")}
                    </span>
                    <span className="ml-auto text-xs text-zinc-400">
                      {(sectorData.symbols_by_sector[sector] || []).length}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Geselecteerde sectoren: {derivedSymbols.length} aandelen.
                {selectedSectors.length === 0 && sectorData && (
                  <> Geen sectoren gekozen? Dan gebruikt de AI het standaard universum van {sectorData.default_universe.length} aandelen.</>
                )}
              </p>
            </div>

            <div className="border-t border-zinc-200 pt-6">
              <h3 className="mb-3 text-sm font-medium text-zinc-700">Email digest testen</h3>
              <p className="mb-3 text-xs text-zinc-500">
                Verstuur een test digest naar je eigen e-mailadres. Configureer hiervoor RESEND_API_KEY in de backend.
              </p>
              <div className="flex gap-3">
                {["daily", "weekly", "monthly"].map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => handleSendDigest(freq)}
                    disabled={sendingDigest}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {sendingDigest ? "Versturen..." : `${freq[0].toUpperCase() + freq.slice(1)} digest`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? "Opslaan..." : "Instellingen opslaan"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
