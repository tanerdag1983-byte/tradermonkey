"use client";

import { useEffect, useState } from "react";

interface HealthData {
  status: string;
  version: string;
  app_name?: string;
  environment: string;
  timestamp: string;
}

interface T212Health {
  reachable: boolean;
  account_id?: string;
  currency?: string;
  total_balance?: number;
  error?: string;
}

export default function HealthCheck() {
  const [apiHealth, setApiHealth] = useState<HealthData | null>(null);
  const [t212Health, setT212Health] = useState<T212Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    Promise.all([
      fetch(`${apiUrl}/health`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${apiUrl}/health/trading212`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([apiData, t212Data]) => {
      setApiHealth(apiData);
      setT212Health(t212Data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-sm text-zinc-500">Status laden...</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
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

      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-zinc-500">Trading 212 Connectie</h3>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              t212Health?.reachable ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="font-semibold text-zinc-900">
            {t212Health?.reachable ? "Verbonden" : "Niet verbonden"}
          </span>
        </div>
        {t212Health?.reachable && (
          <p className="mt-1 text-xs text-zinc-500">
            Account: {t212Health.currency} — Balance: {t212Health.total_balance}
          </p>
        )}
        {t212Health?.error && (
          <p className="mt-1 text-xs text-red-600">{t212Health.error}</p>
        )}
      </div>
    </div>
  );
}
