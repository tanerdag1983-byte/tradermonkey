"use client";

import { useEffect, useState } from "react";

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
    return <div className="text-sm text-zinc-500">Status laden...</div>;
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-zinc-500">API Status</h3>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            apiHealth?.status === "ok" ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="font-semibold text-zinc-900">
          {apiHealth?.status === "ok" ? "Online" : "Offline"}
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {apiHealth?.app_name || "TraderMonkeys API"} v{apiHealth?.version || "0.1.0"}
      </p>
    </div>
  );
}
