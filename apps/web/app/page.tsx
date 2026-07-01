import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HealthCheck from "@/components/health-check";
import PortfolioSummaryCards from "@/components/portfolio-summary";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white font-bold">
              TM
            </div>
            <h1 className="text-xl font-bold text-zinc-900">TraderMonkeys</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600">{user?.email}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Uitloggen
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-zinc-900">Dashboard</h2>
          <p className="text-zinc-600">
            Realtime overzicht van je portfolio, signalen en broker status.
          </p>
        </div>

        <HealthCheck />

        <div className="mt-8">
          <PortfolioSummaryCards />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Link
            href="/portfolio"
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:border-zinc-300"
          >
            <h3 className="font-semibold text-zinc-900">Portfolio</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Bekijk je posities, P&L en lopende orders.
            </p>
          </Link>
          <Link
            href="/news"
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:border-zinc-300"
          >
            <h3 className="font-semibold text-zinc-900">Nieuws & Sentiment</h3>
            <p className="mt-2 text-sm text-zinc-600">
              SEC filings, finance feeds en AI-sentiment.
            </p>
          </Link>
          <Link
            href="/signals"
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:border-zinc-300"
          >
            <h3 className="font-semibold text-zinc-900">Signalen</h3>
            <p className="mt-2 text-sm text-zinc-600">AI-generated trade setups en je goedkeuringen.</p>
          </Link>
          <Link
            href="/allocate"
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:border-zinc-300"
          >
            <h3 className="font-semibold text-zinc-900">Portfoliobuilder</h3>
            <p className="mt-2 text-sm text-zinc-600">Geef een budget en krijg een verdelingsadvies.</p>
          </Link>
          <Link
            href="/assistant"
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:border-zinc-300"
          >
            <h3 className="font-semibold text-zinc-900">AI Assistant</h3>
            <p className="mt-2 text-sm text-zinc-600">Vraag over je portfolio en marktomstandigheden.</p>
          </Link>
          <Link
            href="/settings/prompt"
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm hover:border-zinc-300"
          >
            <h3 className="font-semibold text-zinc-900">AI Prompt</h3>
            <p className="mt-2 text-sm text-zinc-600">Pas het prompt aan dat de AI gebruikt voor signalen.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
