"use client";

import { useState } from "react";
import AppHeader from "@/components/app-header";
import { MessageSquareCode, Send, Cpu, Loader2 } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hallo, ik ben je TradingMonkeys AI-assistent. Stel een vraag over je portfolio of de markt.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setLoading(true);

    // TODO: verbind met backend chat endpoint
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Deze assistant is nog in ontwikkeling. Binnenkort koppelen we hem aan je portfolio en nieuwsdata.",
        },
      ]);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <AppHeader />

      <main className="max-w-4xl w-full mx-auto p-4 lg:p-6 flex-1 flex flex-col">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-cyan-400" />
            AI Assistant
          </h2>
          <p className="text-sm text-slate-400 mt-1">Vraag over je portfolio en marktomstandigheden.</p>
        </div>

        <div className="flex-1 bg-[#151518] border border-white/5 rounded-xl shadow-xl overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-3 border-b border-white/5 bg-[#0A0A0B] flex items-center gap-2">
            <MessageSquareCode className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Realtime Chat</span>
            <span className="ml-auto text-[10px] bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded uppercase font-bold">Online</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-cyan-500 text-slate-950 font-medium"
                      : "bg-[#0A0A0B] border border-white/5 text-slate-300"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#0A0A0B] border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  AI denkt na...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="p-3 border-t border-white/5 bg-[#0A0A0B] flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Stel een vraag..."
              className="flex-1 bg-[#151518] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 rounded-lg px-4 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Verstuur
            </button>
          </form>
        </div>
      </main>

      <footer className="mt-auto bg-[#0E0E10] border-t border-white/10 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 TRADERMONKEYS PRO. Alle transacties worden veilig via je broker uitgevoerd.</p>
      </footer>
    </div>
  );
}
