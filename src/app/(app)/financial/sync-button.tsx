"use client";

import { useState } from "react";

export function FinancialSyncButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function sync() {
    setLoading(true);
    setMsg(null);
    setError(false);
    const today = new Date().toISOString().slice(0, 10);
    const past = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    try {
      const res = await fetch(
        `/api/sync/tiny/recent?inicio=${past}&fim=${today}`,
        { method: "POST" },
      );
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try { json = JSON.parse(text); } catch { /* noop */ }
      if (res.ok && json?.ok) {
        setMsg(`${(json.data as Record<string,unknown>)?.synced ?? 0} pedido(s) sincronizado(s).`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setError(true);
        setMsg((json?.error as string) ?? `Erro ${res.status}`);
      }
    } catch (e) {
      setError(true);
      setMsg(e instanceof Error ? e.message : "Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={sync}
        disabled={loading}
        className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {loading ? "Sincronizando…" : "Sincronizar últimos 30 dias"}
      </button>
      {msg && (
        <span className={`text-xs ${error ? "text-red-600" : "text-emerald-600"}`}>{msg}</span>
      )}
    </div>
  );
}
