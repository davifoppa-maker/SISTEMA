"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  PackageCheck,
  Truck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Boxes,
  PackageSearch,
} from "lucide-react";

export interface DashboardMetricsView {
  b2bOpen: number;
  awaitingCollection: number;
  collectedToday: number;
  inTransit: number;
  noTrackingAfter: number;
  atRisk: number;
  delayed: number;
  deliveredToday: number;
}

export interface CardItem {
  id: string;
  number: string;
  customer: string | null;
  detail: string | null;
}

const CARDS = [
  { key: "b2b", label: "B2B em processamento", metric: "b2bOpen", icon: Boxes, tone: "text-slate-700" },
  { key: "awaitingCollection", label: "Aguardando coleta", metric: "awaitingCollection", icon: PackageSearch, tone: "text-sky-600" },
  { key: "collectedToday", label: "Coletados hoje", metric: "collectedToday", icon: PackageCheck, tone: "text-brand-700" },
  { key: "inTransit", label: "Em trânsito", metric: "inTransit", icon: Truck, tone: "text-sky-600" },
  { key: "semRastreio", label: "Sem rastreio", metric: "noTrackingAfter", icon: PackageSearch, tone: "text-amber-600" },
  { key: "atRisk", label: "Em risco", metric: "atRisk", icon: Clock, tone: "text-amber-600" },
  { key: "delayed", label: "Atrasados", metric: "delayed", icon: AlertTriangle, tone: "text-red-600" },
  { key: "deliveredToday", label: "Entregues hoje", metric: "deliveredToday", icon: CheckCircle2, tone: "text-emerald-600" },
] as const;

export function MetricsGrid({
  m,
  lists,
  audience = "b2b",
}: {
  m: DashboardMetricsView;
  lists: Record<string, CardItem[]>;
  audience?: "b2b" | "b2c";
}) {
  const [active, setActive] = useState<string | null>(null);
  // O 1º card mostra o público filtrado (B2B/B2C) "em processamento".
  const cards = CARDS.map((c) =>
    c.key === "b2b" ? { ...c, label: `${audience.toUpperCase()} em processamento` } : c,
  );
  const activeCard = cards.find((c) => c.key === active) ?? null;
  const activeList = active ? lists[active] ?? [] : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          const value = m[c.metric as keyof DashboardMetricsView];
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActive((v) => (v === c.key ? null : c.key))}
              className="block text-left"
            >
              <Card className={`transition hover:border-brand-300 hover:shadow-sm ${active === c.key ? "border-brand-400 ring-1 ring-brand-200" : ""}`}>
                <CardContent className="flex items-center justify-between py-5">
                  <div>
                    <div className="text-2xl font-semibold text-slate-800">{value}</div>
                    <div className="text-xs text-slate-500">{c.label}</div>
                  </div>
                  <Icon className={`h-6 w-6 ${c.tone}`} />
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {activeCard ? (
        <Card className="mt-3">
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                {activeCard.label} ({activeList.length})
              </span>
              <button onClick={() => setActive(null)} className="text-xs text-slate-400 hover:text-slate-600">
                fechar ✕
              </button>
            </div>
            {activeList.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum pedido nesta lista.</p>
            ) : (
              <div className="space-y-1">
                {activeList.map((o) => (
                  <div key={o.id + o.number} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-2 py-1.5 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link href={`/orders/${o.id}`} className="shrink-0 font-medium text-brand-700 hover:underline">
                        #{o.number}
                      </Link>
                      <span className="truncate text-slate-600">{o.customer ?? "—"}</span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{o.detail ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
