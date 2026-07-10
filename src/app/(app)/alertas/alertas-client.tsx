"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export interface AlertaPedido {
  id: string;
  numero: string;
  cliente: string;
  empresa: string;
  status: string;
  data: string | null;
  receita: number;
  margem: number;
  prejuizo: boolean;
  itensRuins: { nome: string; margem: number }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function dataOk(d: string | null): string {
  const ano = Number(String(d ?? "").slice(0, 4));
  return ano >= 2015 && ano <= 2030 ? String(d).slice(0, 10) : "";
}
function fmtData(d: string | null): string {
  const v = dataOk(d);
  if (!v) return "—";
  const [y, m, dd] = v.split("-");
  return `${dd}/${m}/${y}`;
}

export function AlertasClient({ alertas, margemAlvo }: { alertas: AlertaPedido[]; margemAlvo: number }) {
  const prejuizos = alertas.filter((a) => a.prejuizo).length;
  const [ordem, setOrdem] = useState<"data" | "margem">("data");

  const lista = useMemo(() => {
    const arr = [...alertas];
    if (ordem === "margem") {
      arr.sort((a, b) => a.margem - b.margem);
    } else {
      arr.sort((a, b) => {
        const da = dataOk(a.data), db = dataOk(b.data);
        if (da !== db) { if (!da) return 1; if (!db) return -1; return db.localeCompare(da); }
        return a.margem - b.margem;
      });
    }
    return arr;
  }, [alertas, ordem]);

  return (
    <>
      <PageHeader
        title="🚨 Alertas Comerciais"
        description={`Pedidos com margem abaixo de ${margemAlvo}% — revise preços/descontos.`}
      />

      {/* Resumo */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="text-xs font-medium text-amber-300/80">Pedidos em alerta</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">{alertas.length}</div>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <div className="text-xs font-medium text-red-300/80">Com prejuízo</div>
          <div className="mt-1 text-2xl font-bold text-red-400">{prejuizos}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="text-xs font-medium text-emerald-300/80">Margem alvo</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{margemAlvo}%</div>
        </div>
      </div>

      {/* Ordenação */}
      {alertas.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-slate-400">Ordenar por:</span>
          <button type="button" onClick={() => setOrdem("data")}
            className={`h-8 rounded-lg border px-3 font-medium ${ordem === "data" ? "border-violet-500 bg-violet-600/20 text-violet-300" : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
            Mais recentes
          </button>
          <button type="button" onClick={() => setOrdem("margem")}
            className={`h-8 rounded-lg border px-3 font-medium ${ordem === "margem" ? "border-violet-500 bg-violet-600/20 text-violet-300" : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"}`}>
            Pior margem
          </button>
        </div>
      )}

      {alertas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-400">
            ✅ Nenhum pedido abaixo da margem alvo. Tudo saudável!
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Receita</th>
                  <th className="px-4 py-3 text-right">Margem</th>
                  <th className="px-4 py-3">Itens críticos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((a) => (
                  <tr key={a.id} className={a.prejuizo ? "bg-red-500/5" : "bg-amber-500/5"}>
                    <td className="px-4 py-3">
                      <Link href={`/orders/${a.id}`} className="font-semibold text-brand-400 hover:underline">
                        #{a.numero}
                      </Link>
                      <div className="text-[10px] text-slate-400">
                        {a.empresa === "ecopro" ? "Ecopro" : "NRX"} · {a.status}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400">{fmtData(a.data)}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate">{a.cliente}</td>
                    <td className="px-4 py-3 text-right">{brl(a.receita)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${a.prejuizo ? "text-red-400" : "text-amber-400"}`}>
                      {a.prejuizo ? "⚠️ " : ""}{a.margem.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {a.itensRuins.slice(0, 4).map((it, i) => (
                          <span key={i} className="rounded bg-slate-500/20 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {it.nome} ({it.margem}%)
                          </span>
                        ))}
                        {a.itensRuins.length > 4 ? (
                          <span className="text-[10px] text-slate-400">+{a.itensRuins.length - 4}</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
