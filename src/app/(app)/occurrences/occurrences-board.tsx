"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/table";
import { dateTime } from "@/lib/utils/format";

export interface OccItem {
  id: string;
  type: string;
  severity: string;
  status: "aberta" | "em_andamento" | "resolvida";
  description: string;
  opened_at: string;
  order_id: string | null;
  order_number: string | null;
  carrier_name: string | null;
}

const COLUMNS: { status: OccItem["status"]; title: string }[] = [
  { status: "aberta", title: "Aberta" },
  { status: "em_andamento", title: "Em andamento" },
  { status: "resolvida", title: "Resolvida" },
];

export function OccurrencesBoard({ items }: { items: OccItem[] }) {
  const router = useRouter();
  const [cards, setCards] = useState<OccItem[]>(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useEffect(() => setCards(items), [items]);

  async function move(id: string, status: OccItem["status"]) {
    const current = cards.find((c) => c.id === id);
    if (!current || current.status === status) return;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c))); // otimista
    try {
      await fetch(`/api/occurrences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } catch {
      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status: current.status } : c)));
    }
  }

  async function remove(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
    await fetch(`/api/occurrences/${id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => {
        const colCards = cards.filter((c) => c.status === col.status);
        return (
          <Card
            key={col.status}
            className={over === col.status ? "ring-2 ring-brand-400" : ""}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.status);
            }}
            onDragLeave={() => setOver((o) => (o === col.status ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              if (dragId) void move(dragId, col.status);
              setDragId(null);
            }}
          >
            <CardHeader>
              <CardTitle>
                {col.title} ({colCards.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="min-h-[120px] space-y-2">
              {colCards.length === 0 ? <EmptyState message="Arraste pedidos para cá" /> : null}
              {colCards.map((o) => (
                <div
                  key={o.id}
                  draggable
                  onDragStart={() => setDragId(o.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`cursor-grab rounded-lg border border-slate-200 bg-white p-2 text-sm active:cursor-grabbing ${
                    dragId === o.id ? "opacity-50" : ""
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <Badge variant={o.severity === "alta" ? "danger" : o.severity === "media" ? "warning" : "muted"}>
                      {o.type}
                    </Badge>
                    <span className="text-[10px] text-slate-400">{dateTime(o.opened_at)}</span>
                  </div>
                  {o.order_number ? (
                    <a href={`/orders/${o.order_id}`} className="text-xs font-medium text-brand-700 hover:underline">
                      Pedido #{o.order_number}
                    </a>
                  ) : null}
                  <p className="text-xs text-slate-600">{o.description}</p>
                  <p className="text-[10px] text-slate-400">{o.carrier_name}</p>
                  <button
                    onClick={() => remove(o.id)}
                    className="mt-1 text-[10px] text-slate-400 hover:text-red-600"
                  >
                    excluir
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
