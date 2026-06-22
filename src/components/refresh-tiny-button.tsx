"use client";

import { useState } from "react";

function isoLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Botão de atualização sob demanda: puxa do Tiny os pedidos recentes (status,
// valor, transportadora, NF, frete e prazo) sem esperar o sync automático.
export function RefreshTinyButton({ days = 4, label = "Atualizar (Tiny)" }: { days?: number; label?: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    setError(false);
    const fim = isoLocal(new Date());
    const inicio = isoLocal(new Date(Date.now() - days * 86400000));
    try {
      const res = await fetch(`/api/sync/tiny/recent?inicio=${inicio}&fim=${fim}`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMsg(`${json.data?.synced ?? 0} pedido(s) atualizado(s)${json.data?.nfEnriched ? ` · ${json.data.nfEnriched} NF` : ""}.`);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setError(true);
        const detalhe = typeof json.extra === "string" ? json.extra : json.extra ? JSON.stringify(json.extra) : "";
        setMsg(`${json.error ?? "Falha ao atualizar."}${detalhe ? ` — ${detalhe}` : ""}`);
      }
    } catch {
      setError(true);
      setMsg("Falha de rede ao atualizar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={refresh}
        disabled={loading}
        className="h-9 rounded-lg bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {loading ? "Atualizando…" : label}
      </button>
      {msg ? <span className={`text-xs ${error ? "text-red-600" : "text-emerald-600"}`}>{msg}</span> : null}
    </div>
  );
}
