"use client";

import { useEffect, useState } from "react";
import { Activity, CircleDot } from "lucide-react";

interface HealthData {
  status: string;
  version: string;
  app_name?: string;
  environment: string;
  timestamp: string;
}

export default function HealthCheck() {
  const [apiHealth, setApiHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    fetch(`${apiUrl}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((apiData) => {
        setApiHealth(apiData);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-[#151518] border border-white/5 rounded-xl p-4 shadow-xl">
        <p className="text-xs text-slate-400 font-mono">API status laden...</p>
      </div>
    );
  }

  const isOk = apiHealth?.status === "ok";

  return (
    <div className="bg-[#151518] border border-white/5 rounded-xl p-4 shadow-xl">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
        <Activity className="w-4 h-4 text-cyan-400" />
        API Status
      </h3>
      <div className="flex items-center gap-2">
        <CircleDot className={`w-4 h-4 ${isOk ? "text-emerald-400 animate-pulse" : "text-rose-400"}`} />
        <span className="font-semibold text-white">
          {isOk ? "Online" : "Offline"}
        </span>
      </div>
      <p className="mt-1 text-[10px] font-mono text-slate-500">
        {apiHealth?.app_name || "TraderMonkeys API"} v{apiHealth?.version || "0.1.0"} · {" "}
        {apiHealth?.environment || "unknown"}
      </p>
    </div>
  );
}
