"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/app-header";
import { getResearchSettings, getResearchSectors, updateResearchSettings, sendResearchDigest } from "@/lib/supabase/api";
import { Settings, Loader2, Save, Send, AlertCircle, Mail } from "lucide-react";

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
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader />

      <main className="max-w-5xl w-full mx-auto p-4 lg:p-6 flex-1">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-cyan-400" />
            Onderzoeksinstellingen
          </h2>
          <p className="text-sm text-slate-400 mt-1">Kies sectoren of vul een eigen watchlist in. De AI analyseert die set voor jou.</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Instellingen laden...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl space-y-6">
            {message && (
              <div
                className={`rounded-lg border p-4 text-sm flex items-center gap-2 ${
                  message.type === "success"
                    ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-400"
                    : "border-rose-800/60 bg-rose-950/30 text-rose-400"
                }`}
              >
                {message.type === "success" ? <Save className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {message.text}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label htmlFor="budget" className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                  Standaard budget
                </label>
                <input
                  id="budget"
                  type="number"
                  min="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label htmlFor="currency" className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                  Valuta
                </label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label htmlFor="riskProfile" className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                  Risicoprofiel
                </label>
                <select
                  id="riskProfile"
                  value={riskProfile}
                  onChange={(e) => setRiskProfile(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="conservative">Conservatief</option>
                  <option value="moderate">Gematigd</option>
                  <option value="aggressive">Aggressief</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="watchlist" className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                Eigen watchlist (optioneel)
              </label>
              <input
                id="watchlist"
                type="text"
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value.toUpperCase())}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                placeholder="Bijv. AAPL,MSFT,TSLA,NVDA"
              />
              <p className="mt-1 text-xs text-slate-500">Als je deze invult, gebruikt de AI alleen deze lijst.</p>
            </div>

            <div>
              <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">Of kies sectoren</h3>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {sectorData?.sectors.map((sector) => (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => toggleSector(sector)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs transition-all cursor-pointer ${
                      selectedSectors.includes(sector)
                        ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400"
                        : "bg-[#0A0A0B] border-white/10 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${selectedSectors.includes(sector) ? "bg-cyan-500 border-cyan-500 text-[#0A0A0B]" : "border-white/20"}`}>
                      {selectedSectors.includes(sector) && "✓"}
                    </span>
                    <span className="capitalize">{sector.replace("_", " ")}</span>
                    <span className="ml-auto text-[10px] text-slate-500">{(sectorData.symbols_by_sector[sector] || []).length}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Geselecteerde sectoren: {derivedSymbols.length} aandelen.
                {selectedSectors.length === 0 && sectorData && (
                  <> Geen sectoren gekozen? Dan gebruikt de AI het standaard universum van {sectorData.default_universe.length} aandelen.</>
                )}
              </p>
            </div>

            <div className="border-t border-white/5 pt-6">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                <Mail className="w-4 h-4 text-cyan-400" />
                Email digest testen
              </h3>
              <p className="mb-3 text-xs text-slate-400">
                Verstuur een test digest naar je eigen e-mailadres. Configureer hiervoor RESEND_API_KEY in de backend.
              </p>
              <div className="flex gap-3">
                {["daily", "weekly", "monthly"].map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => handleSendDigest(freq)}
                    disabled={sendingDigest}
                    className="rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 px-4 py-2 text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {sendingDigest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {sendingDigest ? "Versturen..." : `${freq[0].toUpperCase() + freq.slice(1)} digest`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-5 py-2.5 text-xs font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2 shadow-md"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Opslaan..." : "Instellingen opslaan"}
              </button>
            </div>
          </form>
        )}
      </main>

      <footer className="mt-auto bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS PRO. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
    </div>
  );
}
