"use client";

import { useState } from "react";

// Painel de sincronização de pedidos do Olist Tiny por período.
// Atalhos (Hoje / Últimos 7 dias) e intervalo personalizado (de/até).
// Envia POST /api/sync/tiny/recent?inicio=YYYY-MM-DD&fim=YYYY-MM-DD.

/** Data local (fuso do navegador) no formato YYYY-MM-DD. */
function isoLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function SyncTinyButton() {
  const today = isoLocal(new Date());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [inicio, setInicio] = useState(today);
  const [fim, setFim] = useState(today);

  async function sync(di: string, df: string) {
    if (di > df) {
      setError(true);
      setMsg("A data inicial não pode ser maior que a final.");
      return;
    }
    setLoading(true);
    setMsg(null);
    setError(false);
    try {
      const qs = new URLSearchParams({ inicio: di, fim: df });
      const res = await fetch(`/api/sync/tiny/recent?${qs.toString()}`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMsg(`${json.data?.synced ?? 0} pedido(s) sincronizado(s) — ${di} a ${df}.`);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(true);
        setMsg(json.error ?? "Falha ao sincronizar.");
      }
    } catch {
      setError(true);
      setMsg("Falha de rede ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }

  function syncToday() {
    const t = isoLocal(new Date());
    setInicio(t);
    setFim(t);
    sync(t, t);
  }

  function syncLast7() {
    const now = new Date();
    const past = new Date(now);
    past.setDate(now.getDate() - 6);
    const di = isoLocal(past);
    const df = isoLocal(now);
    setInicio(di);
    setFim(df);
    sync(di, df);
  }

  const presetBtn =
    "rounded-lg border border-brand-700 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60";
  const dateInput = "h-9 rounded-lg border border-slate-300 px-2 text-sm";

  return (
    <div className="w-full space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="text-xs font-medium text-slate-600">Sincronizar pedidos do Olist por período</div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={syncToday} disabled={loading} className={presetBtn}>Hoje</button>
        <button onClick={syncLast7} disabled={loading} className={presetBtn}>Últimos 7 dias</button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">
          De
          <input type="date" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className={`mt-1 block ${dateInput}`} />
        </label>
        <label className="text-xs text-slate-500">
          Até
          <input type="date" value={fim} min={inicio} max={today} onChange={(e) => setFim(e.target.value)} className={`mt-1 block ${dateInput}`} />
        </label>
        <button
          onClick={() => sync(inicio, fim)}
          disabled={loading}
          className="h-9 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {loading ? "Sincronizando…" : "Sincronizar período"}
        </button>
      </div>

      {msg && <div className={`text-xs ${error ? "text-amber-600" : "text-emerald-600"}`}>{msg}</div>}
    </div>
  );
}
