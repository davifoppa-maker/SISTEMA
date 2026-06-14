"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOGISTIC_STATUS_LABELS, type LogisticStatus } from "@/lib/types";

// Permite corrigir manualmente o status logístico de um pedido — útil para
// pedidos antigos cujo status no Tiny avançou mas não foi re-sincronizado
// (ex.: mover de "em processamento" para "em trânsito").
export function StatusControl({ orderId, current }: { orderId: string; current: LogisticStatus }) {
  const router = useRouter();
  const [value, setValue] = useState<LogisticStatus>(current);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (value === current) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMsg({ ok: true, text: "Status atualizado." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: json.error ?? "Falha ao atualizar." });
      }
    } catch {
      setMsg({ ok: false, text: "Falha de rede." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <span className="text-xs font-medium text-slate-500">Mover status (manual)</span>
      <div className="mt-1 flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as LogisticStatus)}
          disabled={loading}
          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        >
          {(Object.keys(LOGISTIC_STATUS_LABELS) as LogisticStatus[]).map((s) => (
            <option key={s} value={s}>
              {LOGISTIC_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={loading || value === current}
          className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {loading ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {msg ? <p className={`mt-1 text-xs ${msg.ok ? "text-emerald-600" : "text-amber-600"}`}>{msg.text}</p> : null}
    </div>
  );
}
