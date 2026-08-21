"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Confere a fila com o Olist: atualiza status e remove pedidos apagados lá.
export function RevalidarButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function revalidar() {
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch("/api/expedicao/revalidar", { method: "POST" });
      const j = await r.json();
      if (r.ok && j.ok) {
        setMsg(`✓ ${j.data.verificados} conferidos · ${j.data.atualizados} atualizados · ${j.data.removidos} removidos`);
        router.refresh();
      } else setMsg(j.error ?? "Falha ao conferir.");
    } catch {
      setMsg("Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="no-print flex items-center gap-2">
      <button
        onClick={revalidar}
        disabled={loading}
        className="rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
      >
        {loading ? "Conferindo com o Olist… (~30s)" : "🔄 Conferir com Olist"}
      </button>
      {msg ? <span className="text-xs text-slate-400">{msg}</span> : null}
    </span>
  );
}
