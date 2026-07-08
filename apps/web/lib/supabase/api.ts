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
  return apiFetch("/sync/alpaca/all", { method: "POST" });
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

export interface ManualPositionInput {
  symbol: string;
  quantity: number;
  avg_price: number;
  currency?: string;
}

export async function getManualPositions() {
  return apiFetch("/manual/positions");
}

export async function createManualPosition(payload: ManualPositionInput) {
  return apiFetch("/manual/positions", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateManualPosition(id: string, payload: Partial<ManualPositionInput>) {
  return apiFetch(`/manual/positions/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteManualPosition(id: string) {
  return apiFetch(`/manual/positions/${id}`, { method: "DELETE" });
}

export interface ManualOrderInput {
  symbol: string;
  direction: "BUY" | "SELL";
  order_type: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  filled_price?: number;
  limit_price?: number;
  stop_price?: number;
  status?: string;
}

export async function getManualOrders(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/manual/orders${qs}`);
}

export async function createManualOrder(payload: ManualOrderInput) {
  return apiFetch("/manual/orders", { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteManualOrder(id: string) {
  return apiFetch(`/manual/orders/${id}`, { method: "DELETE" });
}

export async function runPositionAdvice(symbols?: string[]) {
  return apiFetch("/manual/advice/run", { method: "POST", body: JSON.stringify({ symbols }) });
}

export async function getPositionAdvice(symbol?: string, limit: number = 20) {
  let path = `/manual/advice?limit=${limit}`;
  if (symbol) path += `&symbol=${encodeURIComponent(symbol)}`;
  return apiFetch(path);
}

export interface GenerateResearchRequest {
  symbol?: string;
  watchlist?: string[];
  sectors?: string[];
  budget?: number;
  currency?: string;
  risk_profile?: string;
  frequency?: string;
}

export async function generateResearch(payload: GenerateResearchRequest) {
  return apiFetch("/research/generate", { method: "POST", body: JSON.stringify(payload) });
}

export async function getResearchProposals(params?: { frequency?: string; direction?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.frequency) qs.set("frequency", params.frequency);
  if (params?.direction) qs.set("direction", params.direction);
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  if (params?.offset !== undefined) qs.set("offset", String(params.offset));
  const query = qs.toString();
  return apiFetch(`/research/proposals${query ? `?${query}` : ""}`);
}

export async function getResearchSettings() {
  return apiFetch("/research/settings");
}

export interface ResearchSettingsInput {
  budget?: number;
  currency?: string;
  risk_profile?: string;
  watchlist?: string[];
  sectors?: string[];
}

export async function updateResearchSettings(payload: ResearchSettingsInput) {
  return apiFetch("/research/settings", { method: "PUT", body: JSON.stringify(payload) });
}

export async function getResearchSectors() {
  return apiFetch("/research/sectors");
}

export async function sendResearchDigest(payload: { frequency?: string; limit?: number }) {
  return apiFetch("/research/digest", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateProposalStatus(proposalId: string, status: "approved" | "rejected" | "reviewed") {
  return apiFetch(`/research/proposals/${proposalId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function getSystemPrompt() {
  return apiFetch("/system/prompt");
}

export async function updateSystemPrompt(content: string) {
  return apiFetch("/system/prompt", { method: "POST", body: JSON.stringify({ content }) });
}

export async function resetSystemPrompt() {
  return apiFetch("/system/prompt", { method: "POST", body: JSON.stringify({ reset: true }) });
}
