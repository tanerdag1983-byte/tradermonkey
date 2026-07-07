import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import HealthCheck from "@/components/health-check";
import PortfolioSummaryCards from "@/components/portfolio-summary";
import LatestResearchProposals from "@/components/latest-research";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader userEmail={user?.email || null} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 flex-1">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">Dashboard</h2>
          <p className="text-slate-400">
            Realtime overzicht van je portfolio, onderzoek en signalen.
          </p>
        </div>

        <HealthCheck />

        <div className="mt-8">
          <PortfolioSummaryCards />
        </div>

        <div className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Laatste onderzoeksvoorstellen</h2>
              <p className="text-sm text-slate-400">AI-adviezen die je recent hebt gegenereerd.</p>
            </div>
            <Link
              href="/onderzoek"
              className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
            >
              Alles bekijken
            </Link>
          </div>
          <LatestResearchProposals />
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[
            { href: "/portfolio", title: "Portfolio", desc: "Bekijk je posities, P&L en lopende orders." },
            { href: "/news", title: "Nieuws & Sentiment", desc: "SEC filings, finance feeds en AI-sentiment." },
            { href: "/onderzoek", title: "Onderzoek", desc: "Dagelijks, wekelijks en maandelijks beleggingsadvies." },
            { href: "/signals", title: "Signalen", desc: "AI-generated trade setups en je goedkeuringen." },
            { href: "/allocate", title: "Portfoliobuilder", desc: "Geef een budget en krijg een verdelingsadvies." },
            { href: "/assistant", title: "AI Assistant", desc: "Vraag over je portfolio en marktomstandigheden." },
            { href: "/settings/prompt", title: "AI Prompt", desc: "Pas het prompt aan dat de AI gebruikt voor signalen." },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-white/5 bg-[#151518] p-6 shadow-sm hover:border-cyan-500/30 hover:bg-white/[0.03] transition-all"
            >
              <h3 className="font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{item.desc}</p>
            </Link>
          ))}
        </div>
      </main>

      <footer className="bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS PRO. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
    </div>
  );
}
