"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/app-header";
import { getNewsFeed, ingestNews } from "@/lib/supabase/api";
import { RefreshCw, AlertCircle, ExternalLink } from "lucide-react";

interface NewsItem {
  id: string;
  source: string;
  source_class: string;
  publisher: string;
  title: string;
  body: string | null;
  language: string;
  published_at: string;
  sentiment_score: number | null;
  url: string | null;
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadNews = async () => {
    try {
      const result = await getNewsFeed(50);
      if (result.success) {
        setItems(result.data);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load news");
    } finally {
      setLoading(false);
    }
  };

  const handleIngest = async () => {
    setIngesting(true);
    setError(null);
    try {
      const result = await ingestNews();
      if (result.success) {
        await loadNews();
      } else {
        setError(result.error || "Ingest failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setIngesting(false);
    }
  };

  useEffect(() => {
    loadNews();
    const interval = setInterval(loadNews, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader />

      <main className="max-w-5xl w-full mx-auto p-4 lg:p-6 flex-1">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Nieuws & Sentiment</h2>
            <p className="text-sm text-slate-400 mt-1">Aggregatie van SEC filings, finance feeds en meer met AI-sentiment.</p>
          </div>
          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
          >
            {ingesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {ingesting ? "Laden..." : "Haal nieuws op"}
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-rose-950/40 border border-rose-800/80 rounded-lg p-4 text-rose-400 flex items-center gap-3 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-4 text-xs text-slate-500 font-mono">
          {lastUpdated && <>Laatst bijgewerkt: {lastUpdated.toLocaleTimeString()}</>}
          {loading && !lastUpdated && "Laden..."}
        </div>

        <div className="space-y-4">
          {items.length === 0 && !loading && (
            <div className="bg-[#151518] border border-white/5 rounded-xl p-6 text-center">
              <p className="text-sm text-slate-400">Nog geen nieuws. Klik op &quot;Haal nieuws op&quot;.</p>
            </div>
          )}
          {items.map((item) => (
            <article
              key={item.id}
              className="bg-[#151518] border border-white/5 rounded-xl p-5 shadow-xl hover:border-white/10 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 font-bold text-slate-300 border border-white/5">
                      {item.source_class}
                    </span>
                    <span>{item.publisher}</span>
                    <span className="text-slate-600">•</span>
                    <span>{new Date(item.published_at).toLocaleString("nl-NL")}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-cyan-400 flex items-center gap-1"
                      >
                        {item.title}
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>
                  {item.body && (
                    <p
                      className="mt-2 text-xs text-slate-300 leading-relaxed line-clamp-3"
                      dangerouslySetInnerHTML={{ __html: item.body }}
                    />
                  )}
                </div>
                <SentimentBadge score={item.sentiment_score} />
              </div>
            </article>
          ))}
        </div>
      </main>

      <footer className="mt-auto bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS PRO. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
    </div>
  );
}

function SentimentBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-400 border border-white/5 whitespace-nowrap">—</span>;
  }

  let label = "Neutraal";
  let colorClass = "bg-zinc-800 text-slate-400 border-white/5";

  if (score > 0.3) {
    label = "Positief";
    colorClass = "bg-emerald-950/40 text-emerald-400 border-emerald-800/40";
  } else if (score < -0.3) {
    label = "Negatief";
    colorClass = "bg-rose-950/40 text-rose-400 border-rose-800/40";
  }

  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-bold whitespace-nowrap border ${colorClass}`}>
      {label} {score.toFixed(2)}
    </span>
  );
}
