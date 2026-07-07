"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSystemPrompt, updateSystemPrompt, resetSystemPrompt } from "@/lib/supabase/api";

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
          <h2 className="text-2xl font-bold text-zinc-900">AI Prompt bewerken</h2>
          <p className="text-zinc-600">
            Pas hier het systeemprompt aan dat de AI gebruikt bij het genereren van signalen.
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-500">Laden...</div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${source === "override" ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-600"}`}>
                {source === "override" ? "Aangepaste prompt" : "Standaard prompt"}
              </span>
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="h-96 w-full rounded-lg border border-zinc-300 p-3 font-mono text-sm text-zinc-900"
              placeholder="Plak hier je aangepaste prompt..."
            />

            {message && (
              <div className="mt-4 text-sm text-zinc-600">{message}</div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? "Opslaan..." : "Opslaan"}
              </button>
              <button
                onClick={handleReset}
                disabled={saving}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Reset naar standaard
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
