"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getNewsFeed, ingestNews } from "@/lib/supabase/api";

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
          <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            Terug naar dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">Nieuws & Sentiment</h2>
            <p className="text-zinc-600">
              Aggregatie van SEC filings, finance feeds en meer met AI-sentiment.
            </p>
          </div>
          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {ingesting ? "Laden..." : "Haal nieuws op"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4 text-xs text-zinc-500">
          {lastUpdated && <>Laatst bijgewerkt: {lastUpdated.toLocaleTimeString()}</>}
          {loading && !lastUpdated && "Laden..."}
        </div>

        <div className="space-y-4">
          {items.length === 0 && !loading && (
            <p className="text-sm text-zinc-500">Nog geen nieuws. Klik op "Haal nieuws op".</p>
          )}
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium uppercase text-zinc-700">
                      {item.source_class}
                    </span>
                    <span>{item.publisher}</span>
                    <span>•</span>
                    <span>{new Date(item.published_at).toLocaleString("nl-NL")}</span>
                  </div>
                  <h3 className="text-base font-semibold text-zinc-900">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600"
                      >
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>
                  {item.body && (
                    <p
                      className="mt-2 text-sm text-zinc-600 line-clamp-3"
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
    </div>
  );
}

function SentimentBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">—</span>;
  }

  let label = "Neutraal";
  let colorClass = "bg-zinc-100 text-zinc-700";

  if (score > 0.3) {
    label = "Positief";
    colorClass = "bg-green-100 text-green-700";
  } else if (score < -0.3) {
    label = "Negatief";
    colorClass = "bg-red-100 text-red-700";
  }

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap ${colorClass}`}>
      {label} {score.toFixed(2)}
    </span>
  );
}
