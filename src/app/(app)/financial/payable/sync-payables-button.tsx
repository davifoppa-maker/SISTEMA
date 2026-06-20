"use client";

import { useState } from "react";

export function SyncPayablesButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function sync() {
    setLoading(true);
    setMsg(null);
    setError(false);
    const now = new Date();
    // Do início de 3 meses atrás até o fim do mês seguinte.
    const inicio = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    const fim = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().slice(0, 10);
    try {
      const res = await fetch(`/api/sync/tiny/payables?inicio=${inicio}&fim=${fim}`, { method: "POST" });
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try { json = JSON.parse(text); } catch { /* noop */ }
      if (res.ok && json?.ok) {
        setMsg(`${(json.data as Record<string,unknown>)?.synced ?? 0} conta(s) importada(s).`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setError(true);
        setMsg((json?.error as string) ?? `Erro ${res.status}: ${text.slice(0, 150)}`);
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
        {loading ? "Importando…" : "Importar do Olist Tiny"}
      </button>
      {msg && (
        <span className={`text-xs ${error ? "text-red-600" : "text-emerald-600"}`}>{msg}</span>
      )}
    </div>
  );
}
