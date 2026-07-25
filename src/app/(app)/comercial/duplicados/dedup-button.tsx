"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DedupButton() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      // 1) dry-run para saber quantos.
      const dry = await fetch("/api/debug/dedup-pedidos?k=exxdebug").then((r) => r.json());
      const n = dry?.data?.seriam_removidos ?? dry?.seriam_removidos ?? 0;
      if (!n) { setMsg("Nenhum pedido duplicado para apagar. ✅"); setBusy(false); return; }
      if (!confirm(`${n} pedido(s) duplicado(s) serão apagados (mantém 1 de cada). Confirmar?`)) { setBusy(false); return; }
      // 2) aplica.
      const res = await fetch("/api/debug/dedup-pedidos?k=exxdebug&apply=1").then((r) => r.json());
      const removed = res?.data?.pedidos_removidos ?? res?.pedidos_removidos ?? 0;
      setMsg(`${removed} pedido(s) duplicado(s) apagado(s). Recarregando…`);
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
        {busy ? "Processando…" : "Apagar duplicados"}
      </button>
      {msg ? <span className="text-sm text-slate-300">{msg}</span> : null}
    </div>
  );
}
