"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface Row {
  id: string;
  collected_at: string | null;
  carrier_name: string | null;
  collector_name: string | null;
  orders: { id: string; number: string }[];
  volumes: number;
}

function brDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}
function brTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function BatchesClient({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState<string | null>(null);

  // Agrupa por dia + transportadora (= um lote de coleta).
  const map = new Map<string, { key: string; date: string; carrier: string; items: Row[] }>();
  for (const r of rows) {
    const date = brDate(r.collected_at);
    const carrier = r.carrier_name ?? "—";
    const key = `${date}__${carrier}`;
    if (!map.has(key)) map.set(key, { key, date, carrier, items: [] });
    map.get(key)!.items.push(r);
  }
  const groups = [...map.values()];

  if (groups.length === 0) {
    return <p className="p-8 text-center text-sm text-slate-400">Nenhuma coleta registrada. Finalize um checkout de expedição.</p>;
  }

  return (
    <div className="space-y-2 p-3">
      {groups.map((g) => {
        const totalOrders = g.items.reduce((s, i) => s + (i.orders.length || 1), 0);
        const totalVolumes = g.items.reduce((s, i) => s + i.volumes, 0);
        const isOpen = open === g.key;
        return (
          <div key={g.key} className="rounded-lg border border-slate-200">
            <button
              onClick={() => setOpen(isOpen ? null : g.key)}
              className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"
            >
              <span className="font-medium">{g.date} · 🚚 {g.carrier}</span>
              <span className="flex items-center gap-2 text-sm">
                <Badge variant="info">{totalOrders} pedido(s)</Badge>
                <Badge variant="muted">{totalVolumes} volumes</Badge>
                <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
              </span>
            </button>
            {isOpen ? (
              <div className="border-t border-slate-100 p-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="px-2 py-1">Pedido(s)</th>
                      <th className="px-2 py-1 text-right">Volumes</th>
                      <th className="px-2 py-1 text-right">Horário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((i) => (
                      <tr key={i.id} className="border-t border-slate-50">
                        <td className="px-2 py-1">
                          {i.orders.length
                            ? i.orders.map((o, idx) => (
                                <span key={o.id}>
                                  {idx > 0 ? ", " : ""}
                                  <Link href={`/orders/${o.id}`} className="text-brand-700 hover:underline">#{o.number}</Link>
                                </span>
                              ))
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right font-medium">{i.volumes}</td>
                        <td className="px-2 py-1 text-right text-slate-500">{brTime(i.collected_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
