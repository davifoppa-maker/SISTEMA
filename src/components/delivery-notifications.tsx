"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";

interface DeliveryNotification {
  id: string;
  order_id: string | null;
  message: string;
  created_at: string;
}

// Popup global: mostra as entregas baixadas automaticamente (Arlete/Jadlog) que
// o operador ainda não visualizou, com botão para confirmar a visualização.
// Consulta ao montar e a cada 2 minutos.
export function DeliveryNotifications() {
  const [items, setItems] = useState<DeliveryNotification[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/deliveries", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.ok) setItems(json.data?.items ?? []);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  async function ack(ids?: string[]) {
    setBusy(true);
    try {
      await fetch("/api/notifications/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      setItems((prev) => (ids ? prev.filter((i) => !ids.includes(i.id)) : []));
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-lg">
        <div className="flex items-center justify-between bg-emerald-600 px-3 py-2 text-white">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            {items.length === 1 ? "Entrega confirmada" : `${items.length} entregas confirmadas`}
          </span>
          {items.length > 1 ? (
            <button
              onClick={() => ack()}
              disabled={busy}
              className="rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-medium hover:bg-white/30 disabled:opacity-60"
            >
              Visualizei todas
            </button>
          ) : null}
        </div>
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-2 p-3 text-xs">
              <span className="flex-1 text-slate-700">
                {n.order_id ? (
                  <Link href={`/orders/${n.order_id}`} className="font-medium text-emerald-700 hover:underline">
                    {n.message}
                  </Link>
                ) : (
                  n.message
                )}
              </span>
              <button
                onClick={() => ack([n.id])}
                disabled={busy}
                title="Marcar como visualizada"
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
