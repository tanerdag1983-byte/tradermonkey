"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Cpu, Shield, Key, Smartphone, CircleDot, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AppHeaderProps {
  userEmail?: string | null;
}

export default function AppHeader({ userEmail }: AppHeaderProps) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(userEmail ?? null);
  const [systemTime, setSystemTime] = useState<string>("");

  useEffect(() => {
    if (userEmail) {
      setEmail(userEmail);
    } else {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.email) setEmail(data.user.email);
      });
    }

    const updateTime = () => {
      setSystemTime(new Date().toISOString().replace("T", " ").slice(0, 19));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [userEmail]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="bg-[#0E0E10] border-b border-white/10 py-4 px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-cyan-500 to-cyan-600 p-2.5 rounded-lg shadow-lg flex items-center justify-center">
            <Cpu className="w-6 h-6 text-[#0A0A0B] font-bold" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              TRADER<span className="text-cyan-500">MONKEYS</span>{" "}
              <span className="text-xs bg-white/5 text-cyan-400 font-mono px-2 py-0.5 rounded border border-white/5">
                PRO
              </span>
            </h1>
            <p className="text-xs text-slate-400">AI-Aangestuurd Aandelen & Portfolio Trading Platform</p>
          </div>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 bg-[#0A0A0B] px-3 py-1.5 rounded-md border border-white/5 font-mono text-xs text-slate-400">
          <CircleDot className="w-3 h-3 text-cyan-400 animate-pulse" />
          <span>UTC: {systemTime}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border bg-white/5 text-slate-400 border-white/10">
          <Key className="w-3.5 h-3.5" />
          <span>Broker API: Geen Sleutel</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border bg-rose-500/10 text-rose-400 border-rose-500/20">
          <Shield className="w-3.5 h-3.5" />
          <span>2FA: Inactief</span>
        </div>

        <button className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-1.5 rounded-md text-xs font-medium border border-white/10 transition-all cursor-pointer">
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Push Alerts</span>
        </button>

        <div className="bg-[#0A0A0B] border border-white/10 px-3 py-1.5 rounded-md flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-cyan-400 border border-white/10">
            {email ? email.slice(0, 2).toUpperCase() : "TM"}
          </div>
          <span className="text-xs text-slate-300 font-mono hidden sm:inline">{email || "..."}</span>
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded-md text-xs font-medium border border-white/10 transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Uitloggen</span>
        </button>
      </div>
    </header>
  );
}
