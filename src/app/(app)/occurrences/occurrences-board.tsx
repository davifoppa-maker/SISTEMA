"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

// Colunas do quadro. As 3 primeiras são CATEGORIAS (campo type); a última é o
// estado "resolvida" (status).
type ColKey = "urgencia" | "problema" | "cliente_piti" | "resolvido";
const CATEGORIAS = new Set(["urgencia", "problema", "cliente_piti"]);
const COLUMNS: { key: ColKey; title: string; emoji: string; accent: string; head: string }[] = [
  { key: "urgencia", title: "Urgência", emoji: "🔴", accent: "border-red-300", head: "text-red-600" },
  { key: "problema", title: "Problema a resolver", emoji: "🛠️", accent: "border-amber-300", head: "text-amber-600" },
  { key: "cliente_piti", title: "Cliente dando piti", emoji: "😤", accent: "border-fuchsia-300", head: "text-fuchsia-600" },
  { key: "resolvido", title: "Resolvido", emoji: "✅", accent: "border-emerald-300", head: "text-emerald-600" },
];

// Coluna em que o card aparece.
function colunaDoCard(o: OccItem): ColKey {
  if (o.status === "resolvida") return "resolvido";
  return (CATEGORIAS.has(o.type) ? o.type : "problema") as ColKey;
}

export function OccurrencesBoard({ items }: { items: OccItem[] }) {
  const router = useRouter();
  const [cards, setCards] = useState<OccItem[]>(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ColKey | null>(null);
  const [novo, setNovo] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  useEffect(() => setCards(items), [items]);

  async function move(id: string, col: ColKey) {
    const current = cards.find((c) => c.id === id);
    if (!current || colunaDoCard(current) === col) return;
    // Otimista.
    setCards((cs) => cs.map((c) => (c.id === id
      ? { ...c, status: col === "resolvido" ? "resolvida" : "aberta", type: col === "resolvido" ? c.type : col }
      : c)));
    const body = col === "resolvido" ? { status: "resolvida" } : { type: col };
    try {
      await fetch(`/api/occurrences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } catch {
      setCards((cs) => cs.map((c) => (c.id === id ? current : c)));
    }
  }

  async function adicionar(col: ColKey) {
    const texto = (novo[col] ?? "").trim();
    if (!texto || col === "resolvido") return;
    setSalvando(col);
    try {
      await fetch(`/api/occurrences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: col, description: texto }),
      });
      setNovo((n) => ({ ...n, [col]: "" }));
      router.refresh();
    } finally {
      setSalvando(null);
    }
  }

  async function remove(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
    await fetch(`/api/occurrences/${id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const colCards = cards.filter((c) => colunaDoCard(c) === col.key);
        return (
          <div
            key={col.key}
            className={`rounded-xl border ${over === col.key ? "border-brand-400 ring-2 ring-brand-300" : "border-slate-200"} bg-slate-50/60 p-3`}
            onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); if (dragId) void move(dragId, col.key); setDragId(null); }}
          >
            <div className={`mb-2 flex items-center justify-between px-1 text-sm font-semibold ${col.head}`}>
              <span>{col.emoji} {col.title}</span>
              <span className="rounded-full bg-white px-2 text-xs text-slate-500">{colCards.length}</span>
            </div>

            {/* Adicionar card (não aparece na coluna Resolvido). */}
            {col.key !== "resolvido" ? (
              <div className="mb-2 flex gap-1">
                <input
                  value={novo[col.key] ?? ""}
                  onChange={(e) => setNovo((n) => ({ ...n, [col.key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") void adicionar(col.key); }}
                  placeholder="Escrever e Enter…"
                  className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-brand-400"
                />
                <button
                  onClick={() => adicionar(col.key)}
                  disabled={salvando === col.key}
                  className="h-9 rounded-lg bg-brand-600 px-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >+</button>
              </div>
            ) : null}

            <div className="min-h-[80px] space-y-2">
              {colCards.map((o) => (
                <div
                  key={o.id}
                  draggable
                  onDragStart={() => setDragId(o.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`cursor-grab rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-sm active:cursor-grabbing ${dragId === o.id ? "opacity-50" : ""}`}
                >
                  <p className="whitespace-pre-wrap text-xs text-slate-700">{o.description}</p>
                  {o.order_number ? (
                    <a href={`/orders/${o.order_id}`} className="text-[11px] font-medium text-brand-700 hover:underline">Pedido #{o.order_number}</a>
                  ) : null}
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{dateTime(o.opened_at)}</span>
                    <button onClick={() => remove(o.id)} className="text-[10px] text-slate-400 hover:text-red-600">excluir</button>
                  </div>
                </div>
              ))}
              {colCards.length === 0 ? <p className="px-1 py-4 text-center text-xs text-slate-400">Vazio</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
