"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/app-header";
import { getSystemPrompt, updateSystemPrompt, resetSystemPrompt } from "@/lib/supabase/api";
import { FileCode, Loader2, Save, RotateCcw, AlertCircle } from "lucide-react";

export default function PromptSettingsPage() {
  const [content, setContent] = useState("");
  const [defaultContent, setDefaultContent] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadPrompt = async () => {
    try {
      setLoading(true);
      const res = await getSystemPrompt();
      if (res.success) {
        setContent(res.data.content);
        setSource(res.data.source);
        if (res.data.source === "default") {
          setDefaultContent(res.data.content);
        }
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Fout bij laden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrompt();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await updateSystemPrompt(content);
      if (res.success) {
        setMessage("Prompt opgeslagen.");
        setSource("override");
      } else {
        setMessage(res.error || "Opslaan mislukt");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await resetSystemPrompt();
      if (res.success) {
        setMessage("Teruggezet naar standaardprompt.");
        setSource("default");
        setContent(defaultContent);
      } else {
        setMessage(res.error || "Reset mislukt");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Reset mislukt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader />

      <main className="max-w-5xl w-full mx-auto p-4 lg:p-6 flex-1">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">AI Prompt bewerken</h2>
          <p className="text-sm text-slate-400 mt-1">Pas hier het systeemprompt aan dat de AI gebruikt bij het genereren van signalen.</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Prompt laden...
          </div>
        ) : (
          <div className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <div className="bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/30">
                  <FileCode className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Systeemprompt</h3>
                  <p className="text-xs text-slate-400">Markdown en platte tekst worden ondersteund</p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase border ${
                  source === "override"
                    ? "bg-blue-950/40 text-blue-400 border-blue-800/40"
                    : "bg-zinc-800 text-slate-400 border-white/5"
                }`}
              >
                {source === "override" ? "Aangepaste prompt" : "Standaard prompt"}
              </span>
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="h-96 w-full rounded-lg border border-white/10 bg-[#0A0A0B] p-3 font-mono text-xs text-white focus:border-cyan-500 focus:outline-none placeholder:text-slate-600"
              placeholder="Plak hier je aangepaste prompt..."
            />

            {message && (
              <div className={`mt-4 rounded-lg border p-3 text-sm flex items-center gap-2 ${
                message.includes("opgeslagen") || message.includes("Teruggezet")
                  ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-400"
                  : "border-rose-800/60 bg-rose-950/30 text-rose-400"
              }`}>
                {message.includes("opgeslagen") || message.includes("Teruggezet") ? (
                  <Save className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {message}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-md"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Opslaan..." : "Opslaan"}
              </button>
              <button
                onClick={handleReset}
                disabled={saving}
                className="rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 px-4 py-2 text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset naar standaard
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS PRO. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
    </div>
  );
}
