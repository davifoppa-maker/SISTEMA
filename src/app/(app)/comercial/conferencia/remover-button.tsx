"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Remove os pedidos "só no nosso" (não existem no Olist). Checa só esses números
// (poucos), então é rápido e não estoura o tempo. O endpoint confirma 404 no
// Olist antes de apagar — se o pedido ainda existe (ex.: data diferente), mantém.
export function RemoverApagadosButton({ numeros }: { numeros: string[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (numeros.length === 0) { setMsg("Nada para remover. ✅"); return; }
    if (!confirm(`Verificar e remover ${numeros.length} pedido(s) que não estão no Olist? (só apaga os confirmados apagados no Olist)`)) return;
    setBusy(true);
    setMsg("Verificando no Olist…");
    try {
      // Processa em lotes de 15 para não estourar o tempo da função.
      const lotes: string[][] = [];
      for (let i = 0; i < numeros.length; i += 15) lotes.push(numeros.slice(i, i + 15));
      let removidos = 0;
      for (const lote of lotes) {
        const url = `/api/debug/limpar-apagados?k=exxdebug&numeros=${encodeURIComponent(lote.join(","))}`;
        const r = await fetch(url).then((x) => x.json());
        removidos += r?.data?.removed ?? r?.removed ?? 0;
        setMsg(`Removidos até agora: ${removidos}…`);
      }
      setMsg(`${removidos} pedido(s) removido(s). Recarregando…`);
      setTimeout(() => router.refresh(), 1200);
    } catch (e) {
      setMsg("Erro: " + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={run} disabled={busy}
        className="h-10 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
        {busy ? "Processando…" : `Remover ${numeros.length} pedido(s) apagado(s) no Olist`}
      </button>
      {msg ? <span className="text-sm text-slate-300">{msg}</span> : null}
    </div>
  );
}
