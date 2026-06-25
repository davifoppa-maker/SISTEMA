"use client";

import { useState } from "react";

export function SyncTinyButton({ companyId = "nyer", label }: { companyId?: string; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function sync() {
    setLoading(true);
    setMsg(null);
    setError(false);
    try {
      const res = await fetch(`/api/sync/tiny/recent?empresa=${companyId}`, { method: "POST" });
      let json: Record<string, unknown> | null = null;
      const text = await res.text();
      try { json = JSON.parse(text); } catch { /* não é JSON */ }
      if (res.ok && json && json.ok) {
        setMsg(`${(json.data as Record<string, unknown>)?.synced ?? 0} pedido(s) sincronizado(s).`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(true);
        setMsg((json?.error as string) ?? `Erro ${res.status}: ${text.slice(0, 200)}`);
      }
    } catch (e) {
      setError(true);
      setMsg(`Falha de rede: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="text-xs font-medium text-slate-600">
        Sincronizar pedidos {label ? `— ${label}` : "do Olist Tiny"}
      </div>
      <button
        onClick={sync}
        disabled={loading}
        className="h-9 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {loading ? "Sincronizando…" : "Sincronizar tudo"}
      </button>
      {msg && <div className={`text-xs ${error ? "text-amber-600" : "text-emerald-600"}`}>{msg}</div>}
    </div>
  );
}
