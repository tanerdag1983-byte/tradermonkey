"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Cpu, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      window.location.href = "/";
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-[#0A0A0B] text-slate-200">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-[#151518] border border-white/5 p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-gradient-to-tr from-cyan-500 to-cyan-600 p-2.5 rounded-lg shadow-lg flex items-center justify-center">
            <Cpu className="w-6 h-6 text-[#0A0A0B]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              TRADER<span className="text-cyan-500">MONKEYS</span>
            </h1>
            <p className="text-xs text-slate-400">AI-Aangestuurd Aandelen & Portfolio Trading Platform</p>
          </div>
        </div>
        <p className="text-sm text-slate-400">Log in om je dashboard te bekijken.</p>
        <form className="space-y-5" onSubmit={handleLogin}>
          <div>
            <label htmlFor="email" className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-white/10 bg-[#0A0A0B] px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none placeholder:text-slate-600"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">
              Wachtwoord
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-white/10 bg-[#0A0A0B] px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none placeholder:text-slate-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:opacity-90 disabled:opacity-50 transition-all shadow-md"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Bezig...
              </>
            ) : (
              "Inloggen"
            )}
          </button>
          {message && (
            <p className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-xs text-rose-400">
              {message}
            </p>
          )}
        </form>
      </div>

      <footer className="mt-12 text-center text-xs text-slate-600">
        © 2026 TRADERMONKEYS PRO
      </footer>
    </div>
  );
}
