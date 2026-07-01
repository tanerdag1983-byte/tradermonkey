import { createClient } from "./client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function syncPortfolio() {
  return apiFetch("/sync/all", { method: "POST" });
}

export async function getPortfolio() {
  return apiFetch("/sync/portfolio");
}

export async function syncAlpacaPortfolio() {
  return apiFetch("/sync/alpaca/all", { method: "POST" });
}

export async function ingestNews() {
  return apiFetch("/news/ingest", { method: "POST" });
}

export async function getNewsFeed(limit: number = 50) {
  return apiFetch(`/news/feed?limit=${limit}`);
}

export async function getSignals() {
  return apiFetch("/signals/feed");
}

export async function generateSignal(symbol: string) {
  return apiFetch(`/signals/generate/${symbol}`, { method: "POST" });
}

export async function approveSignal(id: string) {
  return apiFetch(`/signals/${id}/approve`, { method: "POST" });
}

export async function rejectSignal(id: string) {
  return apiFetch(`/signals/${id}/reject`, { method: "POST" });
}

export async function executeSignal(id: string) {
  return apiFetch(`/signals/${id}/execute`, { method: "POST" });
}

export async function getBrokerStatus() {
  return apiFetch("/broker/status");
}
